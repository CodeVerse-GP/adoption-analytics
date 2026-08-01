import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { adoptionAnalyticsPlugin } from '@codeverse-gp/plugin-adoption-analytics';
import analyticsModule from './apis';
import { navModule } from './modules/nav';
import signInModule from './modules/signIn';

export default createApp({
  features: [
    catalogPlugin,
    navModule,
    adoptionAnalyticsPlugin,
    analyticsModule,
    signInModule,
  ],
});
