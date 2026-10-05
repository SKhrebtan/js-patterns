import { Controller, Injectable, Logger, Sse, } from '@nestjs/common'
import type { MessageEvent, } from '@nestjs/common'
import { OnEvent, } from '@nestjs/event-emitter'
import { Subject, finalize, interval, map, merge, } from 'rxjs'
import type { Observable, } from 'rxjs'

const SSE_BROADCAST_EVENT = 'sse.broadcast'
const SSE_HEARTBEAT_MS = 15_000

/**
	* SSE - 001
	* Single shared stream for all subscribers.
	* @remarks
	* Any part of the app can push an event via `EventEmitter2.emit('sse.broadcast', { type, data })`
	* or by calling `SseService.send()` directly.
*/
@Injectable()
export class SseService {
	private readonly events$ = new Subject<MessageEvent>()

	public send(type: string, data: unknown,): void {
		this.events$.next({ type, data: data as object, },)
	}

	@OnEvent(SSE_BROADCAST_EVENT,)
	private handleBroadcast(payload: { type: string; data: unknown },): void {
		this.send(payload.type, payload.data,)
	}

	/**
		* Events + heartbeat, so proxies/load balancers don't close an idle connection.
	*/
	public stream(): Observable<MessageEvent> {
		const heartbeat$ = interval(SSE_HEARTBEAT_MS,).pipe(
			map((): MessageEvent => {
				return { type: 'heartbeat', data: { ts: Date.now(), }, }
			},),
		)
		return merge(this.events$.asObservable(), heartbeat$,)
	}
}

/**
	* SSE - 002
	* GET /events/stream — opens a `text/event-stream` connection.
	* @remarks
	* Nest unsubscribes automatically when the client closes the connection.
	* Client:
	* ```ts
	* const source = new EventSource('/events/stream', { withCredentials: true, })
	* source.addEventListener('asset-action', (e) => console.log(JSON.parse(e.data)))
	* source.addEventListener('heartbeat', () => {})
	* ```
*/
@Controller('events',)
export class SseController {
	private readonly logger: Logger = new Logger(SseController.name,)

	constructor(private readonly sseService: SseService,) {}

	@Sse('stream',)
	public stream(): Observable<MessageEvent> {
		this.logger.log('[SSE] client connected',)
		return this.sseService.stream().pipe(
			finalize(() => {
				this.logger.log('[SSE] client disconnected',)
			},),
		)
	}
}
