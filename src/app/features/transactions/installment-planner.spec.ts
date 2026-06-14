import { buildInstallmentTransactions } from './installment-planner';

describe('buildInstallmentTransactions', () => {
  it('cria uma transação por parcela com datas mensais', () => {
    const rows = buildInstallmentTransactions({
      startDate: new Date(2026, 5, 12),
      kind: 'EXPENSE',
      categoryId: 1,
      accountPublicKey: 'principal',
      baseDescription: 'Bateria',
      installmentCount: 4,
      initialInstallment: 1,
      parcelEveryMonths: 1,
      periodicity: 'MENSAL',
      parcelAmount: 500,
      useParcelAmountMode: true,
      totalAmount: 2000,
      installmentGroupId: 'group-1',
    });

    expect(rows.length).toBe(4);
    expect(rows.map((r) => r.amount)).toEqual([500, 500, 500, 500]);
    expect(rows[0].occurredAt.slice(0, 10)).toBe('2026-06-12');
    expect(rows[1].occurredAt.slice(0, 10)).toBe('2026-07-12');
    expect(rows[2].occurredAt.slice(0, 10)).toBe('2026-08-12');
    expect(rows[3].occurredAt.slice(0, 10)).toBe('2026-09-12');
    expect(rows[0].description).toContain('Parcela 1/4');
    expect(rows[3].description).toContain('Parcela 4/4');
    expect(rows.every((r) => r.installmentGroupId === 'group-1')).toBe(true);
  });
});
