import { useEffect, } from 'react'
import { io, } from 'socket.io-client'
import type { Socket, } from 'socket.io-client'
import { create, } from 'zustand'

/**
	* SOCKET - CLIENT
	* Frontend counterpart of `websocket.ts` (`EventsGateway`).
	* @remarks
	* `useWebsocket` connects once; the JWT goes in the httpOnly cookie (`withCredentials`),
	* which `WsJwtGuard` reads from the handshake. The backend then pushes events
	* (`cbonds-update`, `asset-action`, presence for admins), which land in the store.
	* Socket.IO reconnects automatically; the server-side heartbeat drops dead sockets.
*/
type SocketStatus = 'idle' | 'connected' | 'disconnected' | 'unauthorized'

type SocketState = {
	socket:    Socket | null
	status:    SocketStatus
	events:    Record<string, unknown>
	setStatus: (status: SocketStatus,) => void
	setEvent:  (event: string, data: unknown,) => void
}

export const useSocketStore = create<SocketState>((set,) => {
	return {
		socket:    null,
		status:    'idle',
		events:    {},
		setStatus: (status,) => {
			set({ status, },)
		},
		setEvent:  (event, data,) => {
			set((state,) => {
				return { events: { ...state.events, [event]: data, }, }
			},)
		},
	}
},)

/**
	* Connects once (call it in a top-level component, e.g. App/Layout).
	* @param url - backend URL.
	* @param isAuthenticated - connect only after login (cookie is set).
	* @param events - server event names to store.
*/
export const useWebsocket = (url: string, isAuthenticated: boolean, events: Array<string>,): void => {
	const eventsKey = events.join(',',)

	useEffect(() => {
		if (!isAuthenticated) {
			return undefined
		}
		const { setStatus, setEvent, } = useSocketStore.getState()
		const socket = io(url, {
			// Sends auth cookies with the handshake.
			withCredentials: true,
			transports:      ['websocket',],
		},)
		useSocketStore.setState({ socket, },)

		socket.on('connect', () => {
			setStatus('connected',)
		},)
		socket.on('disconnect', () => {
			setStatus('disconnected',)
		},)
		socket.on('unauthorized', () => {
			setStatus('unauthorized',)
			socket.disconnect()
		},)

		eventsKey.split(',',).filter(Boolean,).forEach((event,) => {
			socket.on(event, (data: unknown,) => {
				setEvent(event, data,)
			},)
		},)

		return (): void => {
			socket.removeAllListeners()
			socket.disconnect()
			useSocketStore.setState({ socket: null, status: 'disconnected', },)
		}
	}, [url, isAuthenticated, eventsKey,],)
}

/**
	* Returns the latest payload of a given server event (re-renders only when it changes).
*/
export const useSocketEvent = <T,>(event: string,): T | undefined => {
	return useSocketStore((state,) => {
		return state.events[event] as T | undefined
	},)
}

// Usage:
// App.tsx:        useWebsocket(import.meta.env.VITE_API_URL, isAuthenticated, ['cbonds-update', 'asset-action'])
// any component:  const update = useSocketEvent<{ success: boolean; message: string }>('cbonds-update')
//                 useEffect(() => { if (update) queryClient.invalidateQueries() }, [update])
//                 const status = useSocketStore((s) => s.status)
