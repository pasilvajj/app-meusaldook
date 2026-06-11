export type GenderCode = 'M' | 'F';

export interface MeResponse {
  email: string;
  fullName: string;
  gender: GenderCode | null;
  cpf: string | null;
  birthDate: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
}

export interface PersonalInfoPatchBody {
  fullName: string;
  gender: GenderCode;
  cpf?: string | null;
  birthDate?: string | null;
}

export interface AddressPatchBody {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  postalCode?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface ContactPatchBody {
  phone?: string | null;
}
