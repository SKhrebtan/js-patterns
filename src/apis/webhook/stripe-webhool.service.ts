// @srs docs/srs/domains/subscriptions-billing/subscription-lifecycle-flows.md
// @srs-flows S6a/S6b payment failure outcomes (first vs recurring) — REQ-SUB-LC-FN-07/08
// @srs-check first failure → unpaid + Blocked; recurring → unpaid + property stays Active
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SubscriptionsService } from '@server/modules/subscriptions/services/subscriptions.service';
import SubscriptionEntity from '@modules/subscriptions/subscriptions.entity';
import { TransactionsService } from '@modules/transactions/services/transactions.service';
import { StripeService } from '@modules/payments/strategies/stripe.service';
import { ChargeStatus, PaymentProvider, SubscriptionStatus, UserStatusEnum, StripeBillingReason } from '@flamingo-home-space/shader-ui/enums';
import { TariffsTypeEnum } from '@flamingo-home-space/shader-ui/types';
import { TransactionStatusEnum } from '@server/shared/enums/transaction-status.enum';
import { MailerService } from '@server/shared/services/mailer/mailer.service';
import { EmailTemplateKey } from '@shared/services/mailer/enums/email-template-key.enum';
import { UsersService } from '@modules/users/services/users.service';
import { EMAIL_TEMPLATES_LOGO_URL } from '../../../shared/constants/common.constants';
import { TariffService } from '../../tariffs/services/tariffs.services';
import { ProjectsService } from '@server/modules/projects/services/project.service';
import { StripeWebhookEvent } from '../enums/stripe-webhook-event.enum';
import { FAILURE_SCENARIO } from '../constants/webhook.constants';
import {
  failureDateBelongsToThisSubscription,
  resolveCardPaymentFailureScenario,
} from '../helpers/resolve-card-payment-failure-scenario';
import { PaymentEventEmitterService } from '@modules/transactions/services/payment-event-emitter.service';
import { LocalesEnum } from '@flamingo-home-space/shader-ui/enum/Locale';
import { getTranslatedTariffName } from '@shared/helpers/tariff-translation.helper';

@Injectable()
export class StripeWebhookService {
  private stripe: Stripe;
  constructor(
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    @Inject(forwardRef(() => TransactionsService))
    private readonly transactionsService: TransactionsService,
    private readonly stripeService: StripeService,
    private readonly mailerService: MailerService,
    private readonly tariffService: TariffService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
    private readonly paymentEventEmitterService: PaymentEventEmitterService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService
  ) {
    this.stripe = this.stripeService.getInstance();
  }

  public async handleStripeEvent(event: Stripe.Event) {
    try {
      const eventHandler = this.getEventHandler(event.type);
      if (!eventHandler) {
        Logger.log(`Unhandled event type: ${event.type}`);
        return { error: 'Unsupported event type', type: event.type };
      }

      return await eventHandler(event);
    } catch (error) {
      Logger.error('Stripe Event Handling Failed', error);
      return { error: 'Internal server error', details: error.message };
    }
  }

  private getEventHandler(eventType: string): ((event: Stripe.Event) => Promise<any>) | null {
    const eventHandlers: Record<string, (event: Stripe.Event) => Promise<any>> = {
      [StripeWebhookEvent.CustomerSubscriptionUpdated]: this.handleSubscriptionUpdatedEvent.bind(this),
      [StripeWebhookEvent.CustomerSubscriptionDeleted]: this.handleSubscriptionDeletedEvent.bind(this),
      [StripeWebhookEvent.InvoicePaymentSucceeded]: this.handleInvoicePaymentSucceededEvent.bind(this),
      [StripeWebhookEvent.InvoicePaymentFailed]: this.handleInvoicePaymentFailedEvent.bind(this),
    };

    return eventHandlers[eventType] || null;
  }

  public async handleSubscriptionUpdatedEvent(event: Stripe.CustomerSubscriptionUpdatedEvent) {
    const subscriptionData = event.data.object;
    try {
      const updatePayload = this.resolveSubscriptionUpdatePayload(subscriptionData);
      if (!updatePayload) return;

      await this.subscriptionsService.updateSubscription(subscriptionData.id, {
        ...updatePayload,
        invoiceId: subscriptionData.latest_invoice as string,
      });
    } catch (err) {
      Logger.error('Subscription Updated Handling Failed', err);
      throw err;
    }
  }

  private resolveSubscriptionUpdatePayload(subscriptionData: Stripe.Subscription) {
    type UpdatePayload = { status: SubscriptionStatus; scheduledCancelAt?: Date } | null;

    const rawTimestamp = subscriptionData.cancel_at || subscriptionData.current_period_end;
    const scheduledCancelAt = rawTimestamp > 0 ? new Date(rawTimestamp * 1000) : undefined;

    const scenarios: Array<{
      when: (s: Stripe.Subscription) => boolean;
      then: (s: Stripe.Subscription) => UpdatePayload;
    }> = [
        {
          when: (s) => s.status === 'incomplete_expired',
          then: () => null,
        },
        {
          // Stripe uses `incomplete` when the first invoice is still unpaid. The product
          // vocabulary is `unpaid` — never persist the raw gateway status (REQ-SUB-LC-FN-23).
          when: (s) => s.status === 'incomplete',
          then: () => ({ status: SubscriptionStatus.unpaid }),
        },
        {
          when: (s) => s.status === 'canceled',
          then: () => ({ status: SubscriptionStatus.canceled }),
        },
        {
          when: (s) => s.cancel_at_period_end === true,
          then: () => ({
            status: SubscriptionStatus.scheduleCancel,
            scheduledCancelAt,
          }),
        },
        {
          when: () => true,
          then: (s) => ({ status: s.status as SubscriptionStatus }),
        },
      ];

    const matched = scenarios.find(({ when: predicate }) => predicate(subscriptionData));
    const { then: handler } = matched ?? scenarios[scenarios.length - 1];
    return handler(subscriptionData);
  }

  public async handleSubscriptionDeletedEvent(event: Stripe.CustomerSubscriptionDeletedEvent) {
    const subscriptionData = event.data.object;
    try {
      const subscription = await this.findSubscription(subscriptionData.id);
      if (!subscription) return;

      const projectStatusBeforeBlock = subscription.project.status;

      await this.subscriptionsService.updateSubscription(subscription.subscriptionId, {
        status: SubscriptionStatus.canceled,
        currentPeriodEnd: new Date(subscriptionData.current_period_end * 1000),
      });

      await this.projectsService.updateStatus(subscription.project.id, UserStatusEnum.Blocked);

      const isTrial = !!(subscription.trialStart && subscription.trialEnd);
      type EmailSenderKey = typeof UserStatusEnum.Active | typeof UserStatusEnum.Blocked;
      const emailSenderMap: Partial<Record<EmailSenderKey, () => Promise<void>>> = {
        [UserStatusEnum.Active]: () => this.subscriptionsService.sendActiveObjectSubscriptionEndEmail(subscription),
        [UserStatusEnum.Blocked]: () => this.subscriptionsService.sendBlockedObjectSubscriptionEndEmail(subscription),
      };

      const maybeSend = isTrial ? undefined : emailSenderMap[projectStatusBeforeBlock as EmailSenderKey];
      await maybeSend?.();
    } catch (err) {
      Logger.error('Subscription Deleted Handling Failed', err);
    }
  }

  public async handleInvoicePaymentSucceededEvent(event: Stripe.InvoicePaymentSucceededEvent) {
    const invoice = event.data.object;
    try {
      if (invoice.billing_reason === StripeBillingReason.subscriptionUpdate) {
        await this.handleSubscriptionUpdate(invoice);
      }

      const subscription = await this.findSubscriptionByInvoiceId({ invoiceId: invoice.id });
      if (subscription?.subscriptionId) {
        const lineItem = invoice.lines.data[0];
        if (lineItem.period?.start && lineItem.period?.end) {
          await this.subscriptionsService.updateSubscription(subscription.subscriptionId, {
            currentPeriodStart: new Date(lineItem.period.start * 1000),
            currentPeriodEnd: new Date(lineItem.period.end * 1000),
            hasSuccessfulFirstPayment: true,
            pendingSwitchToPackageId: null,
          });
        }

        const user = subscription.user;
        const owner = subscription.enterprise?.owner;
        const recipientEmail = owner?.email ?? user?.email;
        const recipientLang = owner?.lang ?? user?.lang ?? LocalesEnum.EN;
        const amountPaid = invoice.amount_paid ?? 0;
        if (amountPaid > 0) {
          const paymentIntentData = {
            amount: amountPaid / 100,
            packageTitle: subscription.package.title,
            project: subscription.project.id,
            objectId: subscription.project.id,
            enterpriseId: subscription.enterprise.id,
            subscriptionId: subscription.subscriptionId,
            userId: user.id,
            invoice: invoice.id,
            paymentProvider: PaymentProvider.STRIPE,
            status: TransactionStatusEnum.succeeded,
            chargeStatus: ChargeStatus.Succeeded,
            currency: invoice.currency,
            description: `Payment succeeded for ${subscription.project.title} in enterprise ${subscription.enterprise.title}`,
          };
          await this.transactionsService.createPaymentIntents(paymentIntentData);

          await this.projectsService.clearFirstPaymentFailureDate(subscription.project.id);
          await this.projectsService.updateStatus(subscription.project.id, UserStatusEnum.Active);

          await this.paymentEventEmitterService.emitPaymentSuccess(subscription, amountPaid / 100, invoice.currency);

          const periodStart = lineItem.period?.start;
          const periodEnd = lineItem.period?.end;
          if (periodStart && periodEnd && recipientEmail) {
            await Promise.all([
              this.sendPaymentSuccessEmail(
                recipientEmail,
                recipientLang,
                subscription.project.title,
                subscription.package.title,
                subscription.package.price,
                new Date(periodStart * 1000),
                new Date(periodEnd * 1000),
              ),
              this.notifyManagersPaymentSuccess(
                subscription.project.id,
                subscription.project.title,
                subscription.package.title,
                subscription.package.price,
                new Date(periodStart * 1000),
                new Date(periodEnd * 1000),
              ),
            ]);
          }
        } else {
          Logger.log(`Skipping transaction creation for invoice ${invoice.id} because amount_paid is 0`);
        }
      }
    } catch (err) {
      Logger.error('Invoice Payment Succeeded Handling Failed', err);
    }
  }

  public async handleInvoicePaymentFailedEvent(event: Stripe.InvoicePaymentFailedEvent) {
    const invoice = event.data.object;

    if (invoice.billing_reason === StripeBillingReason.subscriptionUpdate) {
      await this.handleSubscriptionUpdate(invoice);
    }

    Logger.log(`Invoice ${invoice.id} - parent exists: ${!!invoice.parent}`);
    Logger.log(`Invoice ${invoice.id} - subscription_details exists: ${!!invoice.parent?.subscription_details}`);
    Logger.log(`Invoice ${invoice.id} - subscription exists: ${!!invoice.parent?.subscription_details?.subscription}`);

    const subscriptionId = invoice.parent?.subscription_details?.subscription as string | undefined;
    Logger.log(`Looking for subscription with ID: ${subscriptionId || 'undefined'} for invoice ${invoice.id}`);

    const subscription = subscriptionId ? await this.findSubscription(subscriptionId) : null;
    Logger.log(
      `Subscription ${subscription ? 'found' : 'not found'} for subscriptionId: ${subscriptionId || 'undefined'}`
    );

    if (!subscription) return;

    const { user, project, subscriptionId: subId } = subscription;
    const owner = subscription.enterprise?.owner;
    const recipientEmail = owner?.email ?? user?.email;
    const recipientLang = owner?.lang ?? user?.lang ?? LocalesEnum.EN;
    if (!recipientEmail) return;

    const scenario = this.resolveFailureScenario(invoice, subscription);

    try {
      const { packageTitle, packagePrice } = await this.getPackageDetails(subscription);

      await this.recordFailedTransaction(invoice, subscription, packageTitle);

      await Promise.all([
        this.handleFailureScenario(scenario, {
          userEmail: recipientEmail,
          userLang: recipientLang,
          projectTitle: project.title,
          packageTitle,
          packagePrice,
          projectId: project.id,
          subscriptionId: subId,
          franchiseId: project?.franchiseId ?? subscription.enterprise?.franchiseId ?? null,
        }),
        this.notifyManagersPaymentFailure(
          project.id,
          scenario,
          project.title,
          packageTitle,
          packagePrice,
          subId,
        ),
      ]);

      await this.paymentEventEmitterService.emitPaymentFailure(
        subscription,
        invoice.amount_due / 100,
        invoice.currency
      );
    } catch (err) {
      Logger.error('Invoice Payment Failed Handling Failed', err);
    }
  }

  private async findSubscription(subscriptionId: string) {
    const subscription = await this.subscriptionsService.findOneByCriteria(
      { subscriptionId },
      { relations: ['user', 'project', 'enterprise', 'enterprise.owner', 'package'] }
    );
    if (!subscription?.subscriptionId) {
      Logger.warn(`No subscription found for subscriptionId ${subscriptionId}`);
      return null;
    }
    return subscription;
  }

  private async getPackageDetails(subscription: SubscriptionEntity): Promise<{
    packageTitle: TariffsTypeEnum;
    packagePrice: number;
  }> {
    const { package: pkg, pendingSwitchToPackageId } = subscription;

    const pendingPackage = pendingSwitchToPackageId && (await this.tariffService.findById(pendingSwitchToPackageId));

    return {
      packageTitle: (pendingPackage?.title ?? pkg.title) as TariffsTypeEnum,
      packagePrice: pendingPackage?.price ?? pkg.price,
    };
  }

  private async recordFailedTransaction(
    invoice: Stripe.Invoice,
    subscription: SubscriptionEntity,
    packageTitle: TariffsTypeEnum
  ) {
    const { user, project, enterprise, subscriptionId } = subscription;

    if (invoice.id !== null && invoice.id !== undefined && invoice.id !== '') {
      const alreadyRecorded = await this.transactionsService.findOneByCriteria({ invoice: invoice.id });
      if (alreadyRecorded !== null && alreadyRecorded !== undefined) {
        return;
      }
    }

    const data = {
      packageTitle,
      chargeStatus: ChargeStatus.Failed,
      status: TransactionStatusEnum.succeeded,
      paymentProvider: PaymentProvider.STRIPE,
      amount: invoice.amount_due / 100,
      currency: invoice.currency,
      invoice: invoice.id,
      objectId: project.id,
      project: project.id,
      enterpriseId: enterprise.id,
      subscriptionId,
      userId: user.id,
      description: `Payment failed for ${project.title} in enterprise ${enterprise.title}`,
    };
    await this.transactionsService.createPaymentIntents(data);
  }

  private async applyBlockingActions(projectId: string, subscriptionId: string) {
    await this.projectsService.setFirstPaymentFailureDate(projectId);
    await this.projectsService.updateStatus(projectId, UserStatusEnum.Blocked);
    await this.subscriptionsService.updateStatus(subscriptionId, SubscriptionStatus.unpaid);
  }

  private async markSubscriptionUnpaid(subscriptionId: string, projectId: string) {
    await this.projectsService.setFirstPaymentFailureDate(projectId);
    await this.subscriptionsService.updateStatus(subscriptionId, SubscriptionStatus.unpaid);
  }

  private async sendFirstAttemptFailureEmail(
    email: string,
    userLang: LocalesEnum,
    projectTitle: string,
    packageTitle: string,
    packagePrice: number,
    franchiseId: string | null
  ) {
    const adminEmails = await this.usersService.getAdminEmailsByFranchiseId(franchiseId);
    const emailSupport = this.configService.get<string>('EMAIL_SUPPORT');
    const emailBackup = this.configService.get<string>('EMAIL_BACKUP');
    const bcc = [emailSupport, emailBackup, ...adminEmails].filter(Boolean);
    const tariffTitleTranslated = getTranslatedTariffName(userLang, packageTitle as TariffsTypeEnum);

    await this.mailerService.sendMail(
      email,
      EmailTemplateKey.TRANSACTION_FAILED,
      {
        name: email,
        isFirstTransaction: true,
        objectTitle: projectTitle,
        tariffTitle: tariffTitleTranslated,
        tariffPrice: packagePrice,
        logoUrl: EMAIL_TEMPLATES_LOGO_URL,
      },
      bcc.length ? { bcc } : undefined
    );
  }

  private async sendRecurringFailureEmail(
    email: string,
    userLang: LocalesEnum,
    projectTitle: string,
    packageTitle: string,
    packagePrice: number,
    franchiseId: string | null
  ) {
    const tariffTitleTranslated = getTranslatedTariffName(userLang, packageTitle as TariffsTypeEnum);

    const emailSupport = this.configService.get<string>('EMAIL_SUPPORT');
    const emailBackup = this.configService.get<string>('EMAIL_BACKUP');
    const adminEmails = await this.usersService.getAdminEmailsByFranchiseId(franchiseId);
    const bcc = [emailSupport, emailBackup, ...adminEmails].filter(Boolean);

    const mailOptions: { bcc?: string[] } = {};
    if (bcc.length) {
      mailOptions.bcc = bcc;
    }

    await this.mailerService.sendMail(
      email,
      EmailTemplateKey.TRANSACTION_FAILED,
      {
        name: email,
        isFirstTransaction: false,
        objectTitle: projectTitle,
        tariffTitle: tariffTitleTranslated,
        tariffPrice: packagePrice,
        logoUrl: EMAIL_TEMPLATES_LOGO_URL,
      },
      mailOptions
    );
  }

  private async sendPaymentSuccessEmail(
    email: string,
    userLang: LocalesEnum,
    projectTitle: string,
    packageTitle: string,
    packagePrice: number,
    startDate: Date,
    nextPaymentDate: Date
  ) {
    const tariffTitleTranslated = getTranslatedTariffName(userLang, packageTitle as TariffsTypeEnum);

    const formatDate = (date: Date): string => {
      return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    await this.mailerService.sendMail(email, EmailTemplateKey.TRANSACTION_SUCCESSFUL, {
      name: email,
      objectTitle: projectTitle,
      tariffTitle: tariffTitleTranslated,
      tariffPrice: packagePrice,
      startDate: formatDate(startDate),
      nextPaymentDate: formatDate(nextPaymentDate),
      logoUrl: EMAIL_TEMPLATES_LOGO_URL,
    });
  }

  private resolveFailureScenario(
    invoice: Stripe.Invoice,
    subscription: SubscriptionEntity
  ): keyof typeof FAILURE_SCENARIO {
    const isInitialCreation = invoice.billing_reason === StripeBillingReason.subscriptionCreate;
    return resolveCardPaymentFailureScenario({
      isInitialCreation,
      hasFirstPaymentFailureDate: !!subscription.project?.firstPaymentFailureDate,
      hasSuccessfulFirstPayment: subscription.hasSuccessfulFirstPayment === true,
      failureDateBelongsToThisSubscription: failureDateBelongsToThisSubscription(
        subscription.project?.firstPaymentFailureDate,
        subscription.createdAt
      ),
    });
  }

  private async handleFailureScenario(
    scenario: keyof typeof FAILURE_SCENARIO,
    context: {
      userEmail: string;
      userLang: LocalesEnum;
      projectTitle: string;
      packageTitle: string;
      packagePrice: number;
      projectId: string;
      subscriptionId: string;
      franchiseId: string | null;
    }
  ) {
    const { userEmail, userLang, projectTitle, packageTitle, packagePrice, projectId, subscriptionId, franchiseId } =
      context;
    const handlers: Record<keyof typeof FAILURE_SCENARIO, () => Promise<void>> = {
      InitialFirst: async () => {
        await this.applyBlockingActions(projectId, subscriptionId);
        await this.sendFirstAttemptFailureEmail(
          userEmail,
          userLang,
          projectTitle,
          packageTitle,
          packagePrice,
          franchiseId
        );
      },
      RecurringFirst: async () => {
        await this.markSubscriptionUnpaid(subscriptionId, projectId);
        await this.sendRecurringFailureEmail(
          userEmail,
          userLang,
          projectTitle,
          packageTitle,
          packagePrice,
          franchiseId
        );
      },
    };
    await handlers[scenario]();
  }

  private async handleSubscriptionUpdate(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = invoice.parent?.subscription_details?.subscription;
    if (!subscriptionId) return;

    const lineItem = invoice.lines.data[0];
    const newPriceId = lineItem?.pricing?.price_details?.price;
    if (!newPriceId) return;

    const subscription = await this.findSubscriptionByInvoiceId({ subscriptionId });
    if (!subscription) return;

    const currentPriceId = subscription.package.priceId;
    if (newPriceId === currentPriceId) return;

    const newTariff = await this.tariffService.findOneByCriteria({ priceId: newPriceId });
    if (!newTariff) return;

    await this.subscriptionsService.updateSubscriptionAndProjectTariff(
      subscription.subscriptionId,
      subscription.project.id,
      newTariff.id
    );
  }

  private async findSubscriptionByInvoiceId(where: Partial<SubscriptionEntity>): Promise<SubscriptionEntity> {
    return await this.subscriptionsService.findOneByCriteria(where, {
      relations: ['package', 'user', 'project', 'enterprise', 'enterprise.owner', 'transactions'],
    });
  }

  private async notifyManagersPaymentSuccess(
    projectId: string,
    projectTitle: string,
    packageTitle: string,
    packagePrice: number,
    startDate: Date,
    nextPaymentDate: Date
  ): Promise<void> {
    if (!projectId) return;
    const managers = await this.usersService.findAssignedManagerEmailsByProjectId(projectId);
    await Promise.all(
      managers.map(({ email, lang }) =>
        this.sendPaymentSuccessEmail(email, lang, projectTitle, packageTitle, packagePrice, startDate, nextPaymentDate)
      )
    );
  }

  private async notifyManagersPaymentFailure(
    projectId: string,
    scenario: keyof typeof FAILURE_SCENARIO,
    projectTitle: string,
    packageTitle: string,
    packagePrice: number,
    subscriptionId: string
  ): Promise<void> {
    if (!projectId) return;
    const managers = await this.usersService.findAssignedManagerEmailsByProjectId(projectId);
    await Promise.all(
      managers.map(({ email, lang }) =>
        this.handleFailureScenario(scenario, {
          userEmail: email,
          userLang: lang,
          projectTitle,
          packageTitle,
          packagePrice,
          projectId,
          subscriptionId,
          franchiseId: null,
        })
      )
    );
  }
}
