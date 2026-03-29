import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class Altium365NexarApi implements ICredentialType {
	name = 'altium365NexarApi';

	displayName = 'Altium 365 Nexar API';

	documentationUrl = 'https://support.nexar.com/support/solutions/articles/101000471994-authorization';

	extends = ['oAuth2Api'];

	properties: INodeProperties[] = [
		{
			displayName: 'Workspace URL',
			name: 'workspaceUrl',
			type: 'string',
			default: '',
			placeholder: 'https://yourworkspace.365.altium.com/',
			required: true,
			description: 'Your Altium 365 workspace URL',
		},
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'authorizationCode',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: 'https://identity.nexar.com/connect/authorize',
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: 'https://identity.nexar.com/connect/token',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: 'openid design.domain user.access offline_access',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: 'access_type=offline',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
		{
			displayName: 'Use PKCE',
			name: 'usePKCE',
			type: 'hidden',
			default: true,
		},
		{
			displayName: 'Code Challenge Method',
			name: 'codeChallengeMethod',
			type: 'hidden',
			default: 'SHA256',
		},
	];
}
