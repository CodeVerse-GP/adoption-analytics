import { microsoftAuthApiRef } from '@backstage/core-plugin-api';
import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';

/**
 * Sign-in page offering Microsoft Azure alongside guest.
 *
 * Guest is kept so local development and the e2e tests keep working
 * without Azure credentials; drop it from `providers` once every
 * environment has an app registration.
 */
const signInPage = SignInPageBlueprint.make({
  params: {
    loader: async () => {
      const { SignInPage } = await import('@backstage/core-components');
      return props => (
        <SignInPage
          {...props}
          providers={[
            'guest',
            {
              id: 'microsoft-auth-provider',
              title: 'Microsoft',
              message: 'Sign in using Azure Entra ID',
              apiRef: microsoftAuthApiRef,
            },
          ]}
        />
      );
    },
  },
});

export default createFrontendModule({
  pluginId: 'app',
  extensions: [signInPage],
});
