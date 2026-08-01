import {
  ApiBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import InsightsIcon from '@mui/icons-material/Insights';
import { adoptionAnalyticsApiRef, AdoptionAnalyticsClient } from './api';
import { rootRouteRef } from './routes';

const adoptionAnalyticsApi = ApiBlueprint.make({
  name: 'adoptionAnalyticsApi',
  params: defineParams =>
    defineParams({
      api: adoptionAnalyticsApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new AdoptionAnalyticsClient({ discoveryApi, fetchApi }),
    }),
});

const adoptionAnalyticsPage = PageBlueprint.make({
  params: {
    path: '/adoption-analytics',
    title: 'Adoption Analytics',
    icon: <InsightsIcon />,
    routeRef: rootRouteRef,
    loader: () =>
      import('./components/AdoptionAnalyticsPage').then(m => (
        <m.AdoptionAnalyticsPage />
      )),
  },
});

export const adoptionAnalyticsPlugin = createFrontendPlugin({
  pluginId: 'adoption-analytics',
  routes: {
    root: rootRouteRef,
  },
  extensions: [adoptionAnalyticsApi, adoptionAnalyticsPage],
});

export default adoptionAnalyticsPlugin;
