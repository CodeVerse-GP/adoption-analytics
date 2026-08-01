import {
  analyticsApiRef,
  discoveryApiRef,
  errorApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import {
  ApiBlueprint,
  createFrontendModule,
} from '@backstage/frontend-plugin-api';
import {
  AdoptionAnalyticsCaptureApi,
  AdoptionAnalyticsClient,
} from '@codeverse-gp/plugin-adoption-analytics';

const analyticsApi = ApiBlueprint.make({
  name: 'analyticsApi',
  params: defineParams =>
    defineParams({
      api: analyticsApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        errorApi: errorApiRef,
      },
      factory: ({ discoveryApi, fetchApi, errorApi }) => {
        const onError = (error: unknown) =>
          errorApi.post(
            error instanceof Error ? error : new Error(String(error)),
            { hidden: true },
          );

        return new AdoptionAnalyticsCaptureApi({
          adoptionAnalyticsApi: new AdoptionAnalyticsClient({
            discoveryApi,
            fetchApi,
          }),
          onError,
        });
      },
    }),
});

export default createFrontendModule({
  pluginId: 'app',
  extensions: [analyticsApi],
});
