# Example Setup with GCP

Please check the [gcp folders readme file](../../gcp/README.md).

## Challenge 62: Google Service Account Setup

Challenge 62 requires a Google service account with access to a specific Google Document. Follow the steps below to configure this challenge for your CTF event.

### 1. Create a Google Service Account

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **IAM & Admin** > **Service Accounts**.
3. Click **Create Service Account** and fill in a name (e.g. `wrongsecrets-challenge62`).
4. Grant the service account the **Viewer** role on the project (or a more restrictive custom role that allows reading Google Docs).
5. After creation, click on the service account and go to the **Keys** tab.
6. Click **Add Key** > **Create new key**, select **JSON**, and download the key file.

For more details on creating service accounts, see the [WrongSecrets documentation](https://github.com/OWASP/wrongsecrets) and the [Google Cloud service accounts guide](https://cloud.google.com/iam/docs/service-accounts-create).

### 2. Prepare the Google Document

1. Create a Google Document that will be used as the target for challenge 62.
2. Share the document with the service account email (e.g. `wrongsecrets-challenge62@<project>.iam.gserviceaccount.com`) granting it **Viewer** access.
3. Note the Document ID from the document URL:
   ```
   https://docs.google.com/document/d/<DOCUMENT_ID>/edit
   ```

### 3. Configure the CTF Deployment

#### Base64-encode the service account key

Run the following command to base64-encode the downloaded JSON key file:

```sh
base64 -w 0 service-account-key.json
```

#### Set Helm values

When deploying with Helm, provide the base64-encoded credentials and the document ID:

```sh
helm upgrade --install wrongsecrets ../helm/wrongsecrets-ctf-party \
  --set="balancer.challenge62GoogleCloudCredentials=<base64-encoded-json-key>" \
  --set="balancer.env.CHALLENGE62_DOCUMENT_ID=<your-document-id>"
```

Or add them to your `values.yaml` override file:

```yaml
balancer:
  challenge62GoogleCloudCredentials: "<base64-encoded-json-key>"
  env:
    CHALLENGE62_DOCUMENT_ID: "<your-document-id>"
```

#### How it works

- The `challenge62GoogleCloudCredentials` value is stored as a Kubernetes Secret (`wrongsecrets-challenge62-secret`) in the balancer namespace.
- When a team namespace is provisioned, the balancer automatically creates:
  - A `challenge62` Kubernetes Secret containing the Google service account credentials, mounted as the `GOOGLE_CLOUD_CREDENTIALS` environment variable in the WrongSecrets pod.
  - A `challenge62-config` ConfigMap containing the document ID, mounted as the `CHALLENGE62_DOCUMENT_ID` environment variable in the WrongSecrets pod.
