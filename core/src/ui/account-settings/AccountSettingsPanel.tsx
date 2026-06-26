'use client';

import {
    BOOL_ENABLED,
    FEED_BROWSE_SURFACE_OPTIONS,
    LOGIN_METHOD_OPTIONS,
    MENTION_POLICY_OPTIONS,
    SOURCE_MODE_OPTIONS,
} from '../../config/select-options';
import { DelayPair, Field, Input, LabeledSelect, NumberInput, SecretInput, Textarea } from './fields';
import { NoteEditorField } from './NoteEditorField';

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

    const enabled = Boolean(account.enabled);
    const loginMethod = String(config.loginMethod || 'manual');
    const sourceMode = String(config.sourceMode || 'hashtag_list');

    const feedBrowseDraft = (config.feedBrowse as Record<string, unknown>) || {};
    const feedBrowseSurfaces =
        (Array.isArray(feedBrowseDraft.surfaces) && feedBrowseDraft.surfaces.length > 0
            ? feedBrowseDraft.surfaces
            : ['reels', 'home']) as string[];

    const patchFeedBrowse = (partial: Record<string, unknown>) =>
        patchConfig({
            feedBrowse: {
                surfaces: feedBrowseSurfaces,
                ...feedBrowseDraft,
                ...partial,
            },
        });

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
                    {enabled && (
                        <>
                            <Field label="Login Method">
                                <LabeledSelect
                                    options={LOGIN_METHOD_OPTIONS}
                                    value={loginMethod}
                                    onValueChange={v => patchConfig({ loginMethod: v })}
                                />
                            </Field>
                            {loginMethod === 'credentials' && (
                                <>
                                    <Field label="Username" required>
                                        <Input
                                            value={String(account.username || '')}
                                            onChange={e =>
                                                onChange({ ...account, username: e.target.value })
                                            }
                                        />
                                    </Field>
                                    <Field label="Password" required>
                                        <SecretInput
                                            value={String(config.password || '')}
                                            onChange={e => patchConfig({ password: e.target.value })}
                                        />
                                    </Field>
                                </>
                            )}
                        </>
                    )}
                </div>
            );

        case 'source-settings':
            return (
                <div className="space-y-4">
                    <Field label="Source Mode">
                        <LabeledSelect
                            options={SOURCE_MODE_OPTIONS}
                            value={sourceMode}
                            onValueChange={v => {
                                if (v === 'feed_browse') {
                                    patchConfig({
                                        sourceMode: v,
                                        feedBrowse: {
                                            surfaces: feedBrowseSurfaces,
                                            maxItemsToScan: Number(feedBrowseDraft.maxItemsToScan ?? 30),
                                            maxCommentsPerRun: Number(feedBrowseDraft.maxCommentsPerRun ?? 5),
                                            minRelevanceScore: Number(feedBrowseDraft.minRelevanceScore ?? 0.55),
                                        },
                                    });
                                } else {
                                    patchConfig({ sourceMode: v });
                                }
                            }}
                        />
                    </Field>
                    {sourceMode === 'hashtag_list' && (
                        <Field label="Hashtags (one per line)" hint="Without # prefix" required>
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
                    )}
                    {sourceMode === 'url_list' && (
                        <Field label="Post URLs (one per line)" required>
                            <Textarea
                                value={((account.post_urls as string[]) || []).join('\n')}
                                onChange={e =>
                                    onChange({
                                        ...account,
                                        post_urls: e.target.value
                                            .split('\n')
                                            .map(s => s.trim())
                                            .filter(Boolean),
                                    })
                                }
                            />
                        </Field>
                    )}
                    {sourceMode === 'hashtag_api' && (
                        <>
                            <Field label="Instagram API Access Token" required>
                                <SecretInput
                                    value={String(config.instagramApiAccessToken || '')}
                                    onChange={e =>
                                        patchConfig({ instagramApiAccessToken: e.target.value })
                                    }
                                />
                            </Field>
                            <Field label="Instagram API User ID" required>
                                <Input
                                    value={String(config.instagramApiUserId || '')}
                                    onChange={e =>
                                        patchConfig({ instagramApiUserId: e.target.value })
                                    }
                                />
                            </Field>
                        </>
                    )}
                    {sourceMode === 'new_post_added_to_account' && (
                        <Field label="Monitor Targets (one per line)" required>
                            <Textarea
                                value={((config.targets as string[]) || []).join('\n')}
                                onChange={e =>
                                    patchConfig({
                                        targets: e.target.value
                                            .split('\n')
                                            .map(s => s.trim())
                                            .filter(Boolean),
                                    })
                                }
                            />
                        </Field>
                    )}
                    {sourceMode === 'feed_browse' && (
                        <>
                            <Field
                                label="Browse surfaces"
                                hint="Reels tab scrolls /reels/; Home feed scrolls the main timeline. Use Chrome browser channel for reel video."
                            >
                                <div className="flex flex-wrap gap-3">
                                    {FEED_BROWSE_SURFACE_OPTIONS.map(opt => {
                                        const checked = feedBrowseSurfaces.includes(opt.value);
                                        return (
                                            <label key={opt.value} className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={e => {
                                                        const next = e.target.checked
                                                            ? [...new Set([...feedBrowseSurfaces, opt.value])]
                                                            : feedBrowseSurfaces.filter(s => s !== opt.value);
                                                        patchFeedBrowse({
                                                            surfaces: next.length ? next : ['reels'],
                                                        });
                                                    }}
                                                />
                                                {opt.label}
                                            </label>
                                        );
                                    })}
                                </div>
                            </Field>
                            <Field label="Max items to scan (override)">
                                <NumberInput
                                    value={Number(
                                        (config.feedBrowse as { maxItemsToScan?: number })?.maxItemsToScan ?? 30
                                    )}
                                    onChange={v => patchFeedBrowse({ maxItemsToScan: v })}
                                />
                            </Field>
                            <Field label="Max comments per run (override)">
                                <NumberInput
                                    value={Number(
                                        (config.feedBrowse as { maxCommentsPerRun?: number })?.maxCommentsPerRun ??
                                            5
                                    )}
                                    onChange={v => patchFeedBrowse({ maxCommentsPerRun: v })}
                                />
                            </Field>
                            <Field label="Min relevance score (0–1, override)" hint="Skip items below this AI match score">
                                <NumberInput
                                    value={Number(
                                        (config.feedBrowse as { minRelevanceScore?: number })?.minRelevanceScore ??
                                            0.55
                                    )}
                                    onChange={v => patchFeedBrowse({ minRelevanceScore: v })}
                                />
                            </Field>
                        </>
                    )}
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

        case 'ai-config':
            return (
                <div className="space-y-8">
                    <NoteEditorField
                        label="Skills / Style Guide"
                        hint="Define tone, topics, and comment style for this handle."
                        value={String(account.skills_content || '')}
                        onChange={skills_content => onChange({ ...account, skills_content })}
                        placeholder="Example: Friendly study tips account. Keep comments short, supportive, and on-topic..."
                        monospace
                        minHeightClass="min-h-[400px]"
                    />
                    <NoteEditorField
                        label="AI Prompt Hint"
                        hint="Extra instructions appended when generating each comment."
                        value={String(config.aiPromptHint || '')}
                        onChange={aiPromptHint => patchConfig({ aiPromptHint })}
                        placeholder="Example: Mention our app only when relevant. Avoid hashtags."
                        minHeightClass="min-h-[80px]"
                    />
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
