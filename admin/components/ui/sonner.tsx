'use client';

import { useTheme } from 'next-themes';
import { Toaster as BuzzboToaster } from '@buzzbo/ui';

export function Toaster(props: React.ComponentProps<typeof BuzzboToaster>) {
    const { theme = 'light' } = useTheme();
    return <BuzzboToaster theme={theme as 'light' | 'dark' | 'system'} {...props} />;
}
