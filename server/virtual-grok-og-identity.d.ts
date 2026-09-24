declare module "virtual:grok-og-identity" {
  export const grokOgIdentity: {
    site: {
      title?: string;
      description?: string;
      type?: string;
      card?: string;
      image?: string;
      banner?: string;
      color?: string;
    };
  };
  /** Which public/__grok/ assets the build saw (the Grok sandbox's; absent elsewhere). */
  export const grokPwaAssets: { icon: boolean; installPage: boolean };
}
