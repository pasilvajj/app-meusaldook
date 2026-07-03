import { formatTransactionDescriptionLabel } from './installment-utils';

describe('formatTransactionDescriptionLabel', () => {
  it('formata parcelamento como «Nome 1/2»', () => {
    expect(formatTransactionDescriptionLabel('Cortina\n\n[Parcela 1/2]')).toBe('Cortina 1/2');
  });

  it('ignora metadados [Parcelado: …]', () => {
    const raw = 'Cortina\n[Parcelado: 2x, MENSAL, a cada 1 mês(es), parcela inicial 1]\n[Parcela 2/2]';
    expect(formatTransactionDescriptionLabel(raw)).toBe('Cortina 2/2');
  });

  it('remove tags na mesma linha que o nome', () => {
    const raw =
      'Cortina [Parcelado: 2x, MENSAL, a cada 1 mês(es), parcela inicial 1] [Parcela 1/2]';
    expect(formatTransactionDescriptionLabel(raw)).toBe('Cortina 1/2');
  });

  it('remove tag [Fixa: …] sem parcela', () => {
    expect(formatTransactionDescriptionLabel('Prestação da casa [Fixa: MENSAL, a cada 1]')).toBe(
      'Prestação da casa',
    );
  });

  it('mantém descrição simples sem parcela', () => {
    expect(formatTransactionDescriptionLabel('Supermercado')).toBe('Supermercado');
  });
});
