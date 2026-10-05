import { Injectable, Logger, } from '@nestjs/common'
import { ConfigService, } from '@nestjs/config'

import { JWTService, } from '../../modules/jwt/jwt.service'
import { TOKEN_TYPES, } from '../constants'

import type { Socket, } from 'socket.io'

export type WsAuthResult = {
	isValid: boolean
	clientId?: string
	isImpersonation?: boolean
	isAdmin?: boolean
}

@Injectable()
export class WsJwtGuard {
	private readonly jwtPublicKey: string

	private readonly logger = new Logger(WsJwtGuard.name,)

	constructor(
		private readonly jwtService: JWTService,
		private readonly configService: ConfigService,
	) {
		this.jwtPublicKey = this.configService.getOrThrow('JWT_PUBLIC_KEY',).replace(/\\n/g, '\n',)
	}

	public validateConnection(client: Socket,): boolean {
		return this.authenticate(client,).isValid
	}

	public authenticate(client: Socket,): WsAuthResult {
		try {
			const cookies: Record<string, string | undefined> = this.parseCookies(client.handshake.headers.cookie ?? '',)
			const adminToken = cookies[TOKEN_TYPES.ADMIN_JWT]
			const clientToken = cookies[TOKEN_TYPES.CLIENT_JWT]
			const token = adminToken ?? clientToken

			if (!token) {
				this.logger.warn(`[WS Auth] No JWT token found for client ${client.id}`,)
				return { isValid: false, }
			}

			const isValid = this.jwtService.validateJWTToken(token, this.jwtPublicKey,)

			if (!isValid) {
				this.logger.warn(`[WS Auth] Invalid JWT token for client ${client.id}`,)
				return { isValid: false, }
			}

			const payload = this.jwtService.decodeJWTToken(token,)
			return {
				isValid:         true,
				clientId:        payload.clientId,
				isImpersonation: Boolean(payload.isImpersonation,),
				isAdmin:         Boolean(adminToken,) && !clientToken,
			}
		} catch (error) {
			this.logger.warn(`[WS Auth] Token validation failed for client ${client.id}:`, error,)
			return { isValid: false, }
		}
	}

	private parseCookies(cookieHeader: string,): Record<string, string> {
		const cookies: Record<string, string> = {}

		if (!cookieHeader) {
			return cookies
		}

		cookieHeader.split(';',).forEach((cookie,) => {
			const [name, ...rest] = cookie.trim().split('=',)
			if (name && rest.length > 0) {
				cookies[name.trim()] = rest.join('=',).trim()
			}
		},)

		return cookies
	}
}