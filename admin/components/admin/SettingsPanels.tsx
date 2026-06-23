'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LabeledSelect } from '@/components/ui/select';
import {
    AI_PROVIDER_OPTIONS,
    BOOL_ON_OFF,
    BOOL_YES_NO,
    BROWSER_CHANNEL_OPTIONS,
    HEADLESS_OPTIONS,
} from '@/lib/select-options';
import type { SettingsConfig } from '@shared/config-types';

export { AccountSettingsPanel } from '@buzzbo/core/ui/account-settings';

function Field({
    label,
    children,
    hint,
}: {
    label: string;
    children: React.ReactNode;
    hint?: string;
}) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            {children}
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}

function NumberInput({
    value,
    onChange,
}: {
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <Input
            type="number"
            value={value}
            onChange={e => onChange(Number(e.target.value))}
        />
    );
}

function DelayPair({
    label,
    value,
    onChange,
}: {
    label: string;
    value: { min: number; max: number };
    onChange: (v: { min: number; max: number }) => void;
}) {
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`${label} Min`}>
                <NumberInput value={value.min} onChange={min => onChange({ ...value, min })} />
            </Field>
            <Field label={`${label} Max`}>
                <NumberInput value={value.max} onChange={max => onChange({ ...value, max })} />
            </Field>
        </div>
    );
}

function MsDelay({
    label,
    value,
    onChange,
}: {
    label: string;
    value: { base: number; variance: number };
    onChange: (v: { base: number; variance: number }) => void;
}) {
    return (
        <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">{label}</p>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Base (ms)">
                    <NumberInput value={value.base} onChange={base => onChange({ ...value, base })} />
                </Field>
                <Field label="Variance (ms)">
                    <NumberInput
                        value={value.variance}
                        onChange={variance => onChange({ ...value, variance })}
                    />
                </Field>
            </div>
        </div>
    );
}

export function GlobalSettingsPanel({
    group,
    settings,
    onChange,
}: {
    group: string;
    settings: SettingsConfig;
    onChange: (s: SettingsConfig) => void;
}) {
    const patch = (partial: Partial<SettingsConfig>) => onChange({ ...settings, ...partial });

    switch (group) {
        case 'browser':
            return (
                <div className="space-y-4">
                    <Field label="Headless">
                        <LabeledSelect
                            options={HEADLESS_OPTIONS}
                            value={settings.headless ? 'true' : 'false'}
                            onValueChange={v => patch({ headless: v === 'true' })}
                        />
                    </Field>
                    <Field label="Developer Mode">
                        <LabeledSelect
                            options={BOOL_ON_OFF}
                            value={settings.developerMode ? 'true' : 'false'}
                            onValueChange={v => patch({ developerMode: v === 'true' })}
                        />
                    </Field>
                    <Field label="Browser Channel">
                        <LabeledSelect
                            options={BROWSER_CHANNEL_OPTIONS}
                            value={settings.browserChannel}
                            onValueChange={v => patch({ browserChannel: v as SettingsConfig['browserChannel'] })}
                        />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Viewport Width">
                            <NumberInput
                                value={settings.browserViewport.width}
                                onChange={width =>
                                    patch({
                                        browserViewport: { ...settings.browserViewport, width },
                                    })
                                }
                            />
                        </Field>
                        <Field label="Viewport Height">
                            <NumberInput
                                value={settings.browserViewport.height}
                                onChange={height =>
                                    patch({
                                        browserViewport: { ...settings.browserViewport, height },
                                    })
                                }
                            />
                        </Field>
                    </div>
                </div>
            );

        case 'ai':
            return (
                <div className="space-y-4">
                    <Field label="AI Provider">
                        <LabeledSelect
                            options={AI_PROVIDER_OPTIONS}
                            value={settings.aiProvider}
                            onValueChange={v => patch({ aiProvider: v as SettingsConfig['aiProvider'] })}
                        />
                    </Field>
                    <Field label="Google AI API Key">
                        <Input
                            type="password"
                            value={settings.googleAiApiKey}
                            onChange={e => patch({ googleAiApiKey: e.target.value })}
                        />
                    </Field>
                    <Field label="Groq API Key">
                        <Input
                            type="password"
                            value={settings.groqApiKey}
                            onChange={e => patch({ groqApiKey: e.target.value })}
                        />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Groq Model">
                            <Input value={settings.groqModel} onChange={e => patch({ groqModel: e.target.value })} />
                        </Field>
                        <Field label="Groq Vision Model">
                            <Input value={settings.groqVisionModel} onChange={e => patch({ groqVisionModel: e.target.value })} />
                        </Field>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Local LLM URL">
                            <Input value={settings.localLlmBaseUrl} onChange={e => patch({ localLlmBaseUrl: e.target.value })} />
                        </Field>
                        <Field label="Local LLM Model">
                            <Input value={settings.localLlmModel} onChange={e => patch({ localLlmModel: e.target.value })} />
                        </Field>
                    </div>
                    <Field label="Mock AI Comments">
                        <LabeledSelect
                            options={BOOL_ON_OFF}
                            value={settings.mockAiComments ? 'true' : 'false'}
                            onValueChange={v => patch({ mockAiComments: v === 'true' })}
                        />
                    </Field>
                    <Field label="Max AI Requests / Minute">
                        <NumberInput
                            value={settings.aiMaxRequestsPerMinute}
                            onChange={aiMaxRequestsPerMinute => patch({ aiMaxRequestsPerMinute })}
                        />
                    </Field>
                </div>
            );

        case 'timing':
            return (
                <div className="space-y-4">
                    <DelayPair
                        label="Action Delay (seconds)"
                        value={settings.defaultActionDelaySeconds}
                        onChange={defaultActionDelaySeconds => patch({ defaultActionDelaySeconds })}
                    />
                    <DelayPair
                        label="Monitoring Interval (seconds)"
                        value={settings.monitoringIntervalSeconds}
                        onChange={monitoringIntervalSeconds => patch({ monitoringIntervalSeconds })}
                    />
                </div>
            );

        case 'behavior':
            return (
                <div className="space-y-4">
                    <MsDelay
                        label="Short Wait"
                        value={settings.behavior.shortWaitMs}
                        onChange={shortWaitMs =>
                            patch({ behavior: { ...settings.behavior, shortWaitMs } })
                        }
                    />
                    <MsDelay
                        label="Navigation Wait"
                        value={settings.behavior.navigationWaitMs}
                        onChange={navigationWaitMs =>
                            patch({ behavior: { ...settings.behavior, navigationWaitMs } })
                        }
                    />
                    <MsDelay
                        label="Typing Delay"
                        value={settings.behavior.typingDelayMs}
                        onChange={typingDelayMs =>
                            patch({ behavior: { ...settings.behavior, typingDelayMs } })
                        }
                    />
                </div>
            );

        case 'hashtag':
            return (
                <div className="space-y-6">
                    <div>
                        <h3 className="mb-3 text-sm font-semibold">UI Search</h3>
                        <div className="space-y-4 rounded-lg border p-4">
                            {(['maxPostsToScan', 'maxPostsToComment', 'minLikes', 'minComments', 'likeWeight', 'commentWeight'] as const).map(key => (
                                <Field key={key} label={key}>
                                    <NumberInput
                                        value={settings.hashtagSearch.ui_search[key]}
                                        onChange={v =>
                                            patch({
                                                hashtagSearch: {
                                                    ...settings.hashtagSearch,
                                                    ui_search: { ...settings.hashtagSearch.ui_search, [key]: v },
                                                },
                                            })
                                        }
                                    />
                                </Field>
                            ))}
                            <Field label="Prefer Top Tab">
                                <LabeledSelect
                                    options={BOOL_YES_NO}
                                    value={settings.hashtagSearch.ui_search.preferTopTab ? 'true' : 'false'}
                                    onValueChange={v =>
                                        patch({
                                            hashtagSearch: {
                                                ...settings.hashtagSearch,
                                                ui_search: {
                                                    ...settings.hashtagSearch.ui_search,
                                                    preferTopTab: v === 'true',
                                                },
                                            },
                                        })
                                    }
                                />
                            </Field>
                        </div>
                    </div>
                    <div>
                        <h3 className="mb-3 text-sm font-semibold">API Search</h3>
                        <div className="space-y-4 rounded-lg border p-4">
                            {(['fetchBatchSize', 'maxPostsToComment', 'minLikes', 'minComments', 'likeWeight', 'commentWeight'] as const).map(key => (
                                <Field key={key} label={key}>
                                    <NumberInput
                                        value={settings.hashtagSearch.api_search[key]}
                                        onChange={v =>
                                            patch({
                                                hashtagSearch: {
                                                    ...settings.hashtagSearch,
                                                    api_search: { ...settings.hashtagSearch.api_search, [key]: v },
                                                },
                                            })
                                        }
                                    />
                                </Field>
                            ))}
                        </div>
                    </div>
                </div>
            );

        default:
            return null;
    }
}
