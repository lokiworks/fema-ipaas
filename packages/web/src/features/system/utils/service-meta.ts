import { OptionalServiceKind, ServiceCheckFailure } from '@fema-ipaas/shared';
import { t } from 'i18next';

function name({ kind }: { kind: OptionalServiceKind }): string {
  switch (kind) {
    case OptionalServiceKind.SMTP:
      return t('Email (SMTP)');
    case OptionalServiceKind.OBJECT_STORAGE:
      return t('Object storage');
    case OptionalServiceKind.CONNECTOR_REGISTRY:
      return t('Connector registry');
    case OptionalServiceKind.TEMPLATE_REGISTRY:
      return t('Template registry');
  }
}

function whenEnabled({ kind }: { kind: OptionalServiceKind }): string {
  switch (kind) {
    case OptionalServiceKind.SMTP:
      return t('Used for email alerts, invitations and password reset emails.');
    case OptionalServiceKind.OBJECT_STORAGE:
      return t(
        'Run files and logs are written to the bucket. Existing files are not moved.',
      );
    case OptionalServiceKind.CONNECTOR_REGISTRY:
      return t('Connectors can be installed and updated online.');
    case OptionalServiceKind.TEMPLATE_REGISTRY:
      return t('The template gallery loads templates from this source.');
  }
}

function whenDisabled({ kind }: { kind: OptionalServiceKind }): string {
  switch (kind) {
    case OptionalServiceKind.SMTP:
      return t(
        'Email alert channels and invitation emails are unavailable. Share sign-in links by hand; admins reset passwords.',
      );
    case OptionalServiceKind.OBJECT_STORAGE:
      return t(
        'Files are stored in the database. Fine for one app instance; several app instances should share object storage.',
      );
    case OptionalServiceKind.CONNECTOR_REGISTRY:
      return t('Only the connectors built into the image are available.');
    case OptionalServiceKind.TEMPLATE_REGISTRY:
      return t('The template gallery is empty.');
  }
}

function variables({ kind }: { kind: OptionalServiceKind }): string {
  switch (kind) {
    case OptionalServiceKind.SMTP:
      return 'FEMA_SMTP_HOST · FEMA_SMTP_PORT · FEMA_SMTP_USERNAME · FEMA_SMTP_PASSWORD · FEMA_SMTP_SENDER_EMAIL';
    case OptionalServiceKind.OBJECT_STORAGE:
      return 'FEMA_FILE_STORAGE_LOCATION=S3 · FEMA_S3_ENDPOINT · FEMA_S3_BUCKET · FEMA_S3_ACCESS_KEY_ID · FEMA_S3_SECRET_ACCESS_KEY';
    case OptionalServiceKind.CONNECTOR_REGISTRY:
      return 'FEMA_CONNECTOR_REGISTRY_URL';
    case OptionalServiceKind.TEMPLATE_REGISTRY:
      return 'FEMA_TEMPLATES_SOURCE_URL';
  }
}

function failureHint({
  kind,
  failure,
}: {
  kind: OptionalServiceKind;
  failure: ServiceCheckFailure;
}): string {
  switch (failure) {
    case ServiceCheckFailure.NOT_CONFIGURED:
      return t('Not configured yet.');
    case ServiceCheckFailure.UNREACHABLE:
      return t(
        'Cannot reach the server. Check the address and port, the firewall and the network between containers.',
      );
    case ServiceCheckFailure.AUTHENTICATION:
      return t(
        'The credentials were refused. Check the user name, password or keys.',
      );
    case ServiceCheckFailure.TLS:
      return kind === OptionalServiceKind.SMTP
        ? t(
            'The encrypted connection failed. Port 465 expects SSL; 587 usually expects STARTTLS. For a self-signed certificate set FEMA_SMTP_TLS_REJECT_UNAUTHORIZED=false.',
          )
        : t(
            'The encrypted connection failed. Check that the certificate is trusted.',
          );
    case ServiceCheckFailure.TIMEOUT:
      return t(
        'The server did not answer in time. Check the network and the firewall.',
      );
    case ServiceCheckFailure.REJECTED:
      return t(
        'The service refused the request, for example the bucket does not exist, the recipient was rejected, or the address is not a registry.',
      );
    case ServiceCheckFailure.OTHER:
      return t('The check failed.');
  }
}

export const serviceMeta = {
  name,
  whenEnabled,
  whenDisabled,
  variables,
  failureHint,
};
