import { ConnectionType } from '@fema-ipaas/connector-sdk';
import { ConnectionValueForAuthProperty } from '@fema-ipaas/connector-sdk';
import { httpClient, HttpMethod } from '@fema-ipaas/connector-common';
import type { slackAuth } from '../auth';

export type SlackAuthValue = ConnectionValueForAuthProperty<
  typeof slackAuth
>;

type SlackOAuth2Auth = {
  type:
    | ConnectionType.OAUTH2
    | ConnectionType.CLOUD_OAUTH2
    | ConnectionType.TENANT_OAUTH2;
  access_token: string;
  data: Record<string, unknown>;
};

type SlackCustomAuth = {
  type: ConnectionType.CUSTOM_AUTH;
  props: {
    botToken: string;
    userToken?: string;
  };
};

type SlackAuth = SlackOAuth2Auth | SlackCustomAuth;

function isCustomAuth(auth: SlackAuth): auth is SlackCustomAuth {
  return auth.type === ConnectionType.CUSTOM_AUTH;
}

export function getBotToken(auth: SlackAuthValue): string {
  const a = auth as SlackAuth;
  if (isCustomAuth(a)) {
    return a.props.botToken;
  }
  return a.access_token;
}

export function getUserToken(auth: SlackAuthValue): string | undefined {
  const a = auth as SlackAuth;
  if (isCustomAuth(a)) {
    return a.props.userToken || undefined;
  }
  return (a.data?.['authed_user'] as Record<string, string> | undefined)
    ?.access_token;
}

export function requireUserToken(auth: SlackAuthValue): string {
  const token = getUserToken(auth);
  if (!token) {
    throw new Error(
      JSON.stringify({
        message: 'Missing user token, please re-authenticate',
      })
    );
  }
  return token;
}

export async function getTeamId(auth: SlackAuthValue): Promise<string> {
  const a = auth as SlackAuth;
  if (!isCustomAuth(a)) {
    return (
      (a.data['team_id'] as string) ??
      (a.data['team'] as Record<string, string>)['id']
    );
  }
  const response = await httpClient.sendRequest<{
    ok: boolean;
    team_id: string;
  }>({
    method: HttpMethod.GET,
    url: 'https://slack.com/api/auth.test',
    headers: {
      Authorization: `Bearer ${a.props.botToken}`,
    },
  });
  if (!response.body.ok) {
    throw new Error('Failed to get team ID from Slack auth.test');
  }
  return response.body.team_id;
}


export async function getUserId(auth: SlackAuthValue): Promise<string> {
  const a = auth as SlackAuth;
  if (!isCustomAuth(a)) {
    const userId = (a.data['authed_user'] as Record<string, string> | undefined)?.id;
    if (!userId) {
      throw new Error('Failed to get user ID from Slack auth data');
    }
    return userId;
  }
  const response = await httpClient.sendRequest<{
    ok: boolean;
    user_id: string;
  }>({
    method: HttpMethod.GET,
    url: 'https://slack.com/api/auth.test',
    headers: {
      Authorization: `Bearer ${a.props.botToken}`,
    },
  });
  if (!response.body.ok) {
    throw new Error('Failed to get user ID from Slack auth.test');
  }
  return response.body.user_id;
}
