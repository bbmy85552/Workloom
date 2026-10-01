import { api } from './api';

export interface PublicSettings {
  brandName: string;
  companyName: string;
  oaUrl: string;
  googleClientId: string;
}

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  brandName: '文档中心',
  companyName: '文档中心',
  oaUrl: 'https://2dqy-oa.2dqy.com/calendar',
  googleClientId: '',
};

export async function fetchPublicSettings() {
  const { data } = await api.get<Partial<PublicSettings>>('/public/settings');
  return {
    brandName: data.brandName || DEFAULT_PUBLIC_SETTINGS.brandName,
    companyName: data.companyName || DEFAULT_PUBLIC_SETTINGS.companyName,
    oaUrl: data.oaUrl || DEFAULT_PUBLIC_SETTINGS.oaUrl,
    googleClientId: data.googleClientId || DEFAULT_PUBLIC_SETTINGS.googleClientId,
  };
}
