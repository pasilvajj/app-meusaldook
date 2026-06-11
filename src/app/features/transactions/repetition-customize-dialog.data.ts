export type RepetitionKind = 'UNICA' | 'PARCELADO' | 'FIXA';

export type InstallmentPeriodicity = 'MENSAL' | 'SEMANAL' | 'TRIMESTRAL';

export interface RepetitionCustomizeDialogData {
  repetition: RepetitionKind;
  periodicity: InstallmentPeriodicity;
  everyNMonths: number;
  installmentCount: number;
  initialInstallment: number;
  parcelAmount: number;
  /** Quando verdadeiro, o valor em «parcela» define o total (parcela × nº parcelas). */
  useParcelAmountMode: boolean;
  /** Só «Fixa»: limitar quantidade de ocorrências (`installmentCount` reutilizado como total). */
  defineTotalOccurrences: boolean;
}

export type RepetitionCustomizeDialogResult = RepetitionCustomizeDialogData;
