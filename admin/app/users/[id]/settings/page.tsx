import { AppSettingsPage } from '@/components/admin/AppSettingsPage';

type Props = { params: Promise<{ id: string }> };

export default async function UserSettingsPage({ params }: Props) {
    const { id } = await params;
    return <AppSettingsPage userId={id} />;
}
