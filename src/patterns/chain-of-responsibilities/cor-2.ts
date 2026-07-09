type Locale = 'uk' | 'en' | 'ru';

type LocaleRequest = {
  queryLocale?: string; // ?locale=uk
  cookieLocale?: string; // cookie NEXT_LOCALE
  acceptLanguage?: string; // header Accept-Language
};

// next() = pass control to the following link in the chain
type Next = () => Locale;

// Single link contract: handle the request or call next()
type LocaleHandler = (req: LocaleRequest, next: Next) => Locale;

const SUPPORTED = new Set<Locale>(['uk', 'en', 'ru']);

// Normalize raw input into a supported locale, or null if invalid
const asLocale = (value: string | undefined): Locale | null => {
  if (value === undefined) {
    return null;
  }

  const normalized = value.toLowerCase().slice(0, 2) as Locale;

  return SUPPORTED.has(normalized) ? normalized : null;
};

// Link 1: explicit query param wins first
const fromExplicit: LocaleHandler = (req, next) => {
  const locale = asLocale(req.queryLocale);

  return locale !== null ? locale : next();
};

// Link 2: cookie preference
const fromCookie: LocaleHandler = (req, next) => {
  const locale = asLocale(req.cookieLocale);

  return locale !== null ? locale : next();
};

// Link 3: browser Accept-Language header
const fromAcceptLanguage: LocaleHandler = (req, next) => {
  // Example: "uk-UA,uk;q=0.9,en;q=0.8"
  const parts = (req.acceptLanguage ?? '').split(',');

  for (const part of parts) {
    const locale = asLocale(part.trim());

    if (locale !== null) {
      return locale;
    }
  }

  return next();
};

// Link 4: always resolves — end of the chain
const fromDefault: LocaleHandler = () => 'uk';

// Chain builder (middleware style): each handler may stop or call next()
function compose(...handlers: LocaleHandler[]): LocaleHandler {
  return (req, finalNext) => {
    const dispatch = (index: number): Locale => {
      if (index === handlers.length) {
        return finalNext();
      }

      return handlers[index](req, () => dispatch(index + 1));
    };

    return dispatch(0);
  };
}

// Ready chain: explicit → cookie → Accept-Language → default
const resolveLocale = compose(
  fromExplicit,
  fromCookie,
  fromAcceptLanguage,
  fromDefault,
);

// Usage
resolveLocale(
  {
    cookieLocale: 'en',
    acceptLanguage: 'ru-RU,ru;q=0.9',
  },
  () => 'uk',
);
// → 'en' (cookie matched; later links are not needed)

resolveLocale(
  {
    acceptLanguage: 'de-DE,fr;q=0.8',
  },
  () => 'uk',
);
// → 'uk' (nobody matched → default)