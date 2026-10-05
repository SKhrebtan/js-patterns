import { useEffect, } from 'react'
import { create, } from 'zustand'

/**
	* SSE - CLIENT
	* Frontend counterpart of `sse.ts`.
	* @remarks
	* `useSse` opens one `EventSource`; after that the backend just pushes events,
	* which land in the store. Components read them via `useSseEvent`.
	* The browser reconnects automatically if the connection drops.
*/
type SseStatus = 'idle' | 'open' | 'reconnecting' | 'closed'

type SseState = {
	status:        SseStatus
	lastHeartbeat: number | null
	events:        Record<string, unknown>
	setStatus:     (status: SseStatus,) => void
	setEvent:      (type: string, data: unknown,) => void
}

export const useSseStore = create<SseState>((set,) => {
	return {
		status:        'idle',
		lastHeartbeat: null,
		events:        {},
		setStatus:     (status,) => {
			set({ status, },)
		},
		setEvent:      (type, data,) => {
			set((state,) => {
				return { events: { ...state.events, [type]: data, }, }
			},)
		},
	}
},)

/**
	* Opens the stream once (call it in a top-level component, e.g. App/Layout).
	* @param url - SSE endpoint, e.g. `${API_URL}/events/stream`.
	* @param types - event names to listen for (`type` on the backend).
*/
export const useSse = (url: string, types: Array<string>,): void => {
	const typesKey = types.join(',',)

	useEffect(() => {
		const { setStatus, setEvent, } = useSseStore.getState()
		const source = new EventSource(url, { withCredentials: true, },)

		source.onopen = (): void => {
			setStatus('open',)
		}
		source.onerror = (): void => {
			setStatus(source.readyState === EventSource.CLOSED ?
				'closed' :
				'reconnecting',)
		}

		source.addEventListener('heartbeat', () => {
			useSseStore.setState({ lastHeartbeat: Date.now(), },)
		},)

		const listeners = typesKey.split(',',).filter(Boolean,).map((type,) => {
			const listener = (event: MessageEvent<string>,): void => {
				setEvent(type, JSON.parse(event.data,),)
			}
			source.addEventListener(type, listener,)
			return { type, listener, }
		},)

		return (): void => {
			listeners.forEach(({ type, listener, },) => {
				source.removeEventListener(type, listener,)
			},)
			source.close()
			setStatus('closed',)
		}
	}, [url, typesKey,],)
}

/**
	* Returns the latest payload of a given event type (re-renders only when it changes).
*/
export const useSseEvent = <T,>(type: string,): T | undefined => {
	return useSseStore((state,) => {
		return state.events[type] as T | undefined
	},)
}

// Usage:
// App.tsx:        useSse(`${import.meta.env.VITE_API_URL}/events/stream`, ['asset-action'])
// any component:  const asset = useSseEvent<{ assetId: string }>('asset-action')
//                 const status = useSseStore((s) => s.status)
