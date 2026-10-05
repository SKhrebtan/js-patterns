/* eslint-disable complexity */
/* eslint-disable max-lines */
import { Logger, } from '@nestjs/common'
import { OnEvent, } from '@nestjs/event-emitter'
import { WebSocketGateway, WebSocketServer, } from '@nestjs/websockets'
import { Server, } from 'socket.io'
import type { Socket, } from 'socket.io'
import type { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit,} from '@nestjs/websockets'

import { eventNames, } from './events.constants'
import { CacheWorkerService, } from '../workers/cache-worker.service'
import { RedisCacheService, } from '../../redis-cache/redis-cache.service'
import { WsJwtGuard, } from './ws-jwt.guard'
import { PresenceService, } from '../presence/presence.service'
import { PRESENCE_EVENT, PRESENCE_WS_EVENT, } from '../presence/presence.constants'
import type { ClientPresencePayload, } from '../presence/presence.types'

const ADMIN_ROOM = 'admin'
const CLIENT_ROOM = 'client'

@WebSocketGateway({
	cors: {
		origin:      [process.env['FRONTEND_URL'], process.env['ADMIN_URL'],],
		credentials: true,
	},
},)
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger: Logger = new Logger(EventsGateway.name,)

	constructor(
		private readonly cacheWorkerService: CacheWorkerService,
		private readonly cacheService: RedisCacheService,
		private readonly wsJwtGuard: WsJwtGuard,
		private readonly presenceService: PresenceService,
	) {}

	@WebSocketServer()
	public server: Server

	/**
	 	* CR - 138
 		* SOCKET - 001
 		* Lifecycle hook triggered once after the WebSocket gateway has been initialized.
 		* @remarks
 		* Useful for logging or performing one-time setup logic. Runs once on application boot.
 	*/
	public afterInit(): void {
		setInterval(() => {
			this.checkConnections()
		}, 5_000,)
		this.logger.log('[Socket initialized]',)
	}

	/**
		* SOCKET - 009
		* Heartbeat: every 5s checks that all sockets are still connected.
		* @remarks
		* Uses the built-in `socket.connected` flag; dead sockets are disconnected
		* and `handleDisconnect` cleans up presence.
	*/
	private checkConnections(): void {
		this.server.sockets.sockets.forEach((socket: Socket,) => {
			if (!socket.connected) {
				this.logger.warn(`[Heartbeat] ${socket.id} — connection lost`,)
				socket.disconnect(true,)
			}
		},)
		this.logger.debug(`[Heartbeat] active connections: ${this.server.sockets.sockets.size}`,)
	}

	/**
		* CR - 138
 		* SOCKET - 002
 		* Handles a new WebSocket client connection.
 		* @remarks
 		* Stores the client in the internal `clients` map for further event communication.
 		* @param client - The connected WebSocket client instance.
 	*/
	public async handleConnection(client: Socket,): Promise<void> {
		const auth = this.wsJwtGuard.authenticate(client,)

		if (!auth.isValid) {
			this.logger.warn(`[Client rejected]: ${client.id} — unauthorized`,)
			client.emit('unauthorized', { message: 'Authentication required', },)
			client.disconnect(true,)
			return
		}

		// Track presence only for real client portal sessions.
		// Admin connections and admin-impersonation sessions are excluded.
		const isClientPortalSession = Boolean(auth.clientId,) && !auth.isImpersonation && !auth.isAdmin
		if (isClientPortalSession && auth.clientId) {
			client.data.clientId = auth.clientId
			await client.join(CLIENT_ROOM,)
			await this.presenceService.onConnect(auth.clientId,)
		} else {
			await client.join(ADMIN_ROOM,)
		}

		const role = isClientPortalSession ?
			'client' :
			'admin'
		this.logger.log(`[Client connected]: ${client.id} (${role})`,)
	}

	/**
	 	* CR - 138
 		* SOCKET - 003
 		* Handles WebSocket client disconnection.
 		* @remarks
 		* Cleans up internal references to the client and removes associated event listeners if any.
 		* @param client - The disconnected WebSocket client instance.
 	*/
	public async handleDisconnect(client: Socket,): Promise<void> {
		const clientId = client.data.clientId as string | undefined
		if (clientId) {
			await this.presenceService.onDisconnect(clientId,)
		}
		this.logger.log(`[Client disconnected]: ${client.id}`,)
	}

	/**
	 	* CR - 138
 		* SOCKET - 004
 		* Emits a `cbonds-update` event to all connected WebSocket clients.
 		* @remarks
 		* This method is triggered when the `CBONDS_DATA_UPDATED` application event is fired.
 		* Used to invalidate queries CBonds data has been updated.
 	*/
	@OnEvent(eventNames.CBONDS_DATA_UPDATED, { async: true, },)
	private async handleCbondsDataUpdate(): Promise<void> {
		try {
			await this.cacheService.clear()
			await Promise.all([
				this.cacheWorkerService.updateAllClientsTotals(),
			],)
			await this.cacheService.clear()
			this.server.emit('cbonds-update', {
				success: true,
				message: 'CBonds updated!',
			},)
		} catch (error) {
			this.logger.error('[HandleCbondsDataUpdateEvent] Error:', error,)
		}
	}

	/**
	 	* CR - 138
 		* SOCKET - 005
 		* Emits a `totals-update` event to all connected WebSocket clients.
 		* @remarks
 		* This method is triggered when the `TOTALS_UPDATED` application event is fired.
 		* Used to update cached data after totals changed.
 	*/
	@OnEvent(eventNames.TOTALS_UPDATED,  { async: true, },)
	private async handleTotalsUpdate(): Promise<void> {
		try {
			await this.cacheService.clear()
			await this.cacheWorkerService.runRestoreCache()
			await this.cacheService.clear()
		} catch (error) {
			this.logger.error('[HandleTotalsUpdateEvent] Error:', error,)
		}
	}

	/**
	 	* TASK - 10.4
 		* SOCKET - 006
 		* Emits a `binance-update` event to all connected WebSocket clients.
 		* @remarks
 		* This method is triggered when the `BINANCE_DATA_UPDATED` application event is fired.
 		* Used to invalidate queries Crypto data has been updated.
 	*/
	@OnEvent(eventNames.BINANCE_DATA_UPDATED, { async: true, },)
	private async handleBinanceDataUpdate(): Promise<void> {
		try {
			await this.cacheService.clear()
			await this.cacheWorkerService.handleBinanceUpdate()
			await this.cacheService.clear()
			this.server.emit('cbonds-update', {
				success: true,
				message: 'CBonds updated!',
			},)
		} catch (error) {
			this.logger.error('[HandleBinanceDataUpdate] Error:', error,)
		}
	}

	/**
		* SOCKET - 007
		* Emits an `asset-action` event to all connected WebSocket clients.
		* @remarks
		* Triggered when an asset is created, edited, transferred, or deleted.
		* Used to invalidate order assets queries on all connected clients.
	*/
	@OnEvent(eventNames.ASSET_ACTION, { async: true, },)
	private handleAssetAction(payload: { assetName: string; assetId?: string; portfolioId?: string },): void {
		this.server.emit('asset-action', {
			success: true,
			message: 'Asset updated',
			data:    payload,
		},)
	}

	/**
		* SOCKET - 008
		* Forwards client portal presence transitions to admin sockets only.
		* Triggered by `PresenceService` after `Client.isOnline` flips in the DB.
	*/
	@OnEvent(PRESENCE_EVENT, { async: true, },)
	private handleClientPresenceChange(payload: ClientPresencePayload,): void {
		this.server.to(ADMIN_ROOM,).emit(PRESENCE_WS_EVENT, payload,)
	}

	public async delay(ms: number,): Promise<void> {
		return new Promise((resolve,) => {
			setTimeout(resolve, ms,)
		},)
	}
}