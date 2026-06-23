export declare const GLOBAL_GROUPS: readonly [{
    readonly id: "browser";
    readonly label: "Browser";
}, {
    readonly id: "ai";
    readonly label: "AI Provider";
}, {
    readonly id: "timing";
    readonly label: "Timing";
}, {
    readonly id: "behavior";
    readonly label: "Behavior";
}, {
    readonly id: "hashtag";
    readonly label: "Hashtag Search";
}];
export declare const ACCOUNT_GROUPS: readonly [{
    readonly id: "general";
    readonly label: "General";
}, {
    readonly id: "content";
    readonly label: "Content";
}, {
    readonly id: "mentions";
    readonly label: "Mentions";
}, {
    readonly id: "ai-hint";
    readonly label: "AI Hint";
}, {
    readonly id: "hashtag-override";
    readonly label: "Hashtag Overrides";
}, {
    readonly id: "api-creds";
    readonly label: "API Credentials";
}, {
    readonly id: "delays";
    readonly label: "Delays";
}];
export declare function SettingsSidebar({ groups, active, onSelect, }: {
    groups: readonly {
        id: string;
        label: string;
    }[];
    active: string;
    onSelect: (id: string) => void;
}): import("react").JSX.Element;
//# sourceMappingURL=SettingsSidebar.d.ts.map