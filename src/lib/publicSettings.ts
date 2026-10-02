import { api } from './api';

export interface PublicSettings {
  brandName: string;
  companyName: string;
  oaUrl: string;
  googleClientId: string;
}

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  brandName: 'Workloom',
  companyName: 'Workloom',
  oaUrl: 'https://2dqy-oa.2dqy.com/calendar',
  googleClientId: '',
};

function currentBrand(value: string | undefined) {
  return !value || ['文档中心', '简记', 'jianji'].includes(value.trim().toLowerCase()) ? 'Workloom' : value;
}

export async function fetchPublicSettings() {
  const { data } = await api.get<Partial<PublicSettings>>('/public/settings');
  return {
    brandName: currentBrand(data.brandName),
    companyName: currentBrand(data.companyName),
    oaUrl: data.oaUrl || DEFAULT_PUBLIC_SETTINGS.oaUrl,
    googleClientId: data.googleClientId || DEFAULT_PUBLIC_SETTINGS.googleClientId,
  };
}
