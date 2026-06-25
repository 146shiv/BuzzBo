import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    AccountSettingsPanel,
    SettingsSidebar,
    ACCOUNT_GROUPS,
    getAccountGroups,
    validateAccountSettings,
} from '@buzzbo/core/ui/account-settings';
import {
    Button,
    Sheet,
    SheetContent,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@buzzbo/ui';

export default function SettingsDrawer({
    open,
    accountId,
    onClose,
}: {
    open: boolean;
    accountId: string;
    onClose: () => void;
}) {
    const [group, setGroup] = useState<string>(ACCOUNT_GROUPS[0]?.id ?? 'general');
    const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
    const [original, setOriginal] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open || !accountId) {
            // #region agent log
            fetch('http://127.0.0.1:7812/ingest/bbb13829-4a4f-4b08-be95-693d0e6ccb9d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0ccc5'},body:JSON.stringify({sessionId:'e0ccc5',location:'SettingsDrawer.tsx:useEffect',message:'load skipped',data:{open,accountId:accountId||null},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return;
        }
        // #region agent log
        fetch('http://127.0.0.1:7812/ingest/bbb13829-4a4f-4b08-be95-693d0e6ccb9d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0ccc5'},body:JSON.stringify({sessionId:'e0ccc5',location:'SettingsDrawer.tsx:useEffect',message:'accounts.get start',data:{accountId},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        void window.buzzbo.accounts.get(accountId).then(account => {
            // #region agent log
            fetch('http://127.0.0.1:7812/ingest/bbb13829-4a4f-4b08-be95-693d0e6ccb9d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0ccc5'},body:JSON.stringify({sessionId:'e0ccc5',location:'SettingsDrawer.tsx:useEffect',message:'accounts.get success',data:{accountId,hasAccount:account!=null,keys:account?Object.keys(account as object).slice(0,8):[]},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            setDraft(account as Record<string, unknown>);
            setOriginal(JSON.stringify(account));
        }).catch(err => {
            // #region agent log
            fetch('http://127.0.0.1:7812/ingest/bbb13829-4a4f-4b08-be95-693d0e6ccb9d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e0ccc5'},body:JSON.stringify({sessionId:'e0ccc5',location:'SettingsDrawer.tsx:useEffect',message:'accounts.get failed',data:{accountId,error:err instanceof Error?err.message:String(err)},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
            // #endregion
        });
    }, [open, accountId]);

    const dirty = useMemo(() => {
        if (!draft) return false;
        return JSON.stringify(draft) !== original;
    }, [draft, original]);

    const enabled = Boolean(draft?.enabled);
    const groups = getAccountGroups(enabled);

    useEffect(() => {
        if (!enabled && group !== 'general') setGroup('general');
    }, [enabled, group]);

    async function handleSave() {
        if (!draft || !accountId) return;
        const validationError = validateAccountSettings(draft);
        if (validationError) {
            toast.error(validationError);
            return;
        }
        setSaving(true);
        try {
            const orig = JSON.parse(original) as Record<string, unknown>;
            const patch: Record<string, unknown> = {};
            for (const key of ['enabled', 'username', 'skills_content', 'post_urls', 'config']) {
                if (JSON.stringify(draft[key]) !== JSON.stringify(orig[key])) {
                    patch[key] = draft[key];
                }
            }
            await window.buzzbo.accounts.update(accountId, patch);
            const refreshed = await window.buzzbo.accounts.get(accountId);
            setDraft(refreshed as Record<string, unknown>);
            setOriginal(JSON.stringify(refreshed));
            toast.success('Settings saved');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Sheet open={open} onOpenChange={isOpen => !isOpen && onClose()}>
            <SheetContent side="right" className="flex h-full w-full max-w-xl flex-col" showCloseButton>
                <SheetHeader className="shrink-0 border-b border-border/60 px-5 py-4">
                    <SheetTitle>Handle Settings</SheetTitle>
                </SheetHeader>
                <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-5 py-2.5 text-xs text-amber-200">
                    Global settings managed in Buzzbo Admin
                </div>
                <div
                    className="flex min-h-0 flex-1 flex-row overflow-hidden"
                    data-testid="settings-drawer"
                >
                    {draft ? (
                        <>
                            <div className="w-44 shrink-0 overflow-y-auto border-r border-border/60 bg-muted/20 p-3">
                                <SettingsSidebar
                                    groups={groups}
                                    active={group}
                                    onSelect={setGroup}
                                />
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto p-5">
                                <AccountSettingsPanel
                                    group={group}
                                    account={draft}
                                    onChange={setDraft}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                    )}
                </div>
                <SheetFooter className="shrink-0 flex-row items-center justify-between border-t border-border/60 bg-card px-5 py-4">
                    <span className="text-xs text-muted-foreground">
                        {dirty ? 'Unsaved changes' : 'All changes saved'}
                    </span>
                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={!dirty || saving}
                        data-testid="settings-save"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
