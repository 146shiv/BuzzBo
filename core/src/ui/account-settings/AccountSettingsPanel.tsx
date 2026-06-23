'use client';

import {
    BOOL_ENABLED,
    LOGIN_METHOD_OPTIONS,
    MENTION_POLICY_OPTIONS,
    SOURCE_MODE_OPTIONS,
} from '../../config/select-options';
import { DelayPair, Field, Input, LabeledSelect, NumberInput, Textarea } from './fields';

export function AccountSettingsPanel({
    group,
    account,
    onChange,
}: {
    group: string;
    account: Record<string, unknown>;
    onChange: (a: Record<string, unknown>) => void;
}) {
    const config = (account.config as Record<string, unknown>) || {};
    const patchConfig = (partial: Record<string, unknown>) =>
        onChange({ ...account, config: { ...config, ...partial } });

    switch (group) {
        case 'general':
            return (
                <div className="space-y-4">
                    <Field label="Enabled">
                        <LabeledSelect
                            options={BOOL_ENABLED}
                            value={account.enabled ? 'true' : 'false'}
                            onValueChange={v => onChange({ ...account, enabled: v === 'true' })}
                        />
                    </Field>
                    <Field label="Username">
                        <Input
                            value={String(account.username || '')}
                            onChange={e => onChange({ ...account, username: e.target.value })}
                        />
                    </Field>
                    <Field label="Login Method">
                        <LabeledSelect
                            options={LOGIN_METHOD_OPTIONS}
                            value={String(config.loginMethod || 'manual')}
                            onValueChange={v => patchConfig({ loginMethod: v })}
                        />
                    </Field>
                    <Field label="Password">
                        <Input
                            type="password"
                            value={String(config.password || '')}
                            onChange={e => patchConfig({ password: e.target.value })}
                        />
                    </Field>
                    <Field label="Source Mode">
                        <LabeledSelect
                            options={SOURCE_MODE_OPTIONS}
                            value={String(config.sourceMode || 'hashtag_list')}
                            onValueChange={v => patchConfig({ sourceMode: v })}
                        />
                    </Field>
                </div>
            );

        case 'content':
            return (
                <div className="space-y-4">
                    <Field label="Skills / Style Guide">
                        <Textarea
                            className="min-h-[200px] font-mono text-sm"
                            value={String(account.skills_content || '')}
                            onChange={e => onChange({ ...account, skills_content: e.target.value })}
                        />
                    </Field>
                    <Field label="Hashtags (one per line)" hint="Without # prefix">
                        <Textarea
                            value={((config.hashtags as string[]) || []).join('\n')}
                            onChange={e =>
                                patchConfig({
                                    hashtags: e.target.value
                                        .split('\n')
                                        .map(s => s.trim().replace(/^#/, ''))
                                        .filter(Boolean),
                                })
                            }
                        />
                    </Field>
                    <Field label="Post URLs (one per line)">
                        <Textarea
                            value={((account.post_urls as string[]) || []).join('\n')}
                            onChange={e =>
                                onChange({
                                    ...account,
                                    post_urls: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
                                })
                            }
                        />
                    </Field>
                    <Field label="Monitor Targets (one per line)">
                        <Textarea
                            value={((config.targets as string[]) || []).join('\n')}
                            onChange={e =>
                                patchConfig({
                                    targets: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
                                })
                            }
                        />
                    </Field>
                </div>
            );

        case 'mentions':
            return (
                <div className="space-y-4">
                    <Field label="Mention Username">
                        <Input
                            value={String(config.mentionUsername || '')}
                            onChange={e => patchConfig({ mentionUsername: e.target.value })}
                        />
                    </Field>
                    <Field label="Mention Policy">
                        <LabeledSelect
                            options={MENTION_POLICY_OPTIONS}
                            value={String(config.mentionPolicy || 'ai_only')}
                            onValueChange={v => patchConfig({ mentionPolicy: v })}
                        />
                    </Field>
                </div>
            );

        case 'ai-hint':
            return (
                <Field label="AI Prompt Hint">
                    <Textarea
                        className="min-h-[120px]"
                        value={String(config.aiPromptHint || '')}
                        onChange={e => patchConfig({ aiPromptHint: e.target.value })}
                    />
                </Field>
            );

        case 'api-creds':
            return (
                <div className="space-y-4">
                    <Field label="Instagram API Access Token">
                        <Input
                            type="password"
                            value={String(config.instagramApiAccessToken || '')}
                            onChange={e => patchConfig({ instagramApiAccessToken: e.target.value })}
                        />
                    </Field>
                    <Field label="Instagram API User ID">
                        <Input
                            value={String(config.instagramApiUserId || '')}
                            onChange={e => patchConfig({ instagramApiUserId: e.target.value })}
                        />
                    </Field>
                </div>
            );

        case 'delays':
            return (
                <DelayPair
                    label="Action Delay (seconds)"
                    value={(config.actionDelaySeconds as { min: number; max: number }) || { min: 90, max: 180 }}
                    onChange={actionDelaySeconds => patchConfig({ actionDelaySeconds })}
                />
            );

        case 'hashtag-override':
            return (
                <div className="space-y-4">
                    <Field label="API fetchBatchSize override">
                        <NumberInput
                            value={Number(
                                (config.hashtagSearch as Record<string, Record<string, number>>)?.api_search
                                    ?.fetchBatchSize ?? 100
                            )}
                            onChange={v =>
                                patchConfig({
                                    hashtagSearch: {
                                        ...(config.hashtagSearch as object),
                                        api_search: {
                                            ...((config.hashtagSearch as Record<string, Record<string, number>>)
                                                ?.api_search),
                                            fetchBatchSize: v,
                                        },
                                    },
                                })
                            }
                        />
                    </Field>
                    <Field label="API maxPostsToComment override">
                        <NumberInput
                            value={Number(
                                (config.hashtagSearch as Record<string, Record<string, number>>)?.api_search
                                    ?.maxPostsToComment ?? 5
                            )}
                            onChange={v =>
                                patchConfig({
                                    hashtagSearch: {
                                        ...(config.hashtagSearch as object),
                                        api_search: {
                                            ...((config.hashtagSearch as Record<string, Record<string, number>>)
                                                ?.api_search),
                                            maxPostsToComment: v,
                                        },
                                    },
                                })
                            }
                        />
                    </Field>
                </div>
            );

        default:
            return null;
    }
}
