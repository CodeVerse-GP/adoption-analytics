export interface Config {
  adoptionAnalytics?: {
    /**
     * How long raw analytics events are kept, in days. A daily task
     * prunes anything older than this. Defaults to 90.
     *
     * @visibility backend
     */
    retentionDays?: number;

    /**
     * Salt used when hashing user refs for display to callers without
     * the `adoption-analytics.users.read` permission. Rotate to invalidate all
     * existing pseudonyms without touching event data. Leave unset to
     * use the plugin's built-in default.
     *
     * @visibility secret
     */
    userMaskSalt?: string;

    /**
     * Entity refs of groups whose members may see un-pseudonymized user
     * identifiers on the adoption analytics dashboard (the `adoption-analytics.users.read`
     * permission). Empty / unset means everyone sees masked pseudonyms.
     * Consumed by the permission policy.
     *
     * @visibility backend
     */
    identityGroups?: string[];

    /**
     * Entity refs of groups whose members may open the adoption analytics
     * dashboard (the `adoption-analytics.page.view` permission). Empty / unset
     * means unrestricted, so every signed-in user can open it. Consumed by
     * the permission policy.
     *
     * @visibility backend
     */
    viewerGroups?: string[];
  };
}
