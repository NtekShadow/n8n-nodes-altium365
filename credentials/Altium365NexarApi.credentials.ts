import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class Altium365NexarApi implements ICredentialType {
	name = 'altium365NexarApi';

	displayName = 'Altium 365 Nexar API';

	documentationUrl = 'https://portal.nexar.com/';

	properties: INodeProperties[] = [
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
			description: 'The Client ID from your Nexar application',
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'The Client Secret from your Nexar application',
		},
		{
			displayName: 'Workspace URL',
			name: 'workspaceUrl',
			type: 'string',
			default: '',
			placeholder: 'https://yourworkspace.365.altium.com/',
			required: true,
			description: 'Your Altium 365 workspace URL',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			qs: {},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://identity.nexar.com',
			url: '/connect/token',
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: 'grant_type=client_credentials&client_id={{$credentials.clientId}}&client_secret={{$credentials.clientSecret}}&scope=design.domain',
		},
	};
}
