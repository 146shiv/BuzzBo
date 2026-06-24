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
    readonly id: "source-settings";
    readonly label: "Source Settings";
}, {
    readonly id: "mentions";
    readonly label: "Mentions";
}, {
    readonly id: "ai-config";
    readonly label: "AI Config";
}, {
    readonly id: "hashtag-override";
    readonly label: "Hashtag Overrides";
}, {
    readonly id: "delays";
    readonly label: "Delays";
}];
export declare function getAccountGroups(enabled: boolean): readonly [{
    readonly id: "general";
    readonly label: "General";
}, {
    readonly id: "source-settings";
    readonly label: "Source Settings";
}, {
    readonly id: "mentions";
    readonly label: "Mentions";
}, {
    readonly id: "ai-config";
    readonly label: "AI Config";
}, {
    readonly id: "hashtag-override";
    readonly label: "Hashtag Overrides";
}, {
    readonly id: "delays";
    readonly label: "Delays";
}] | {
    readonly id: "general";
    readonly label: "General";
}[];
export declare function SettingsSidebar({ groups, active, onSelect, }: {
    groups: readonly {
        id: string;
        label: string;
    }[];
    active: string;
    onSelect: (id: string) => void;
}): import("react").JSX.Element;
//# sourceMappingURL=SettingsSidebar.d.ts.map