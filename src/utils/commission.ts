import {CommissionBreakdown, CommissionCalculator} from '../bindings/keys';

export class DefaultCommissionCalculator implements CommissionCalculator {
  calculate(amount: number): CommissionBreakdown {
    if (amount <= 0 || Number.isNaN(amount)) {
      return {grossAmount: 0, platformFee: 0, netAmount: 0};
    }

    const grossAmount = Number(amount.toFixed(2));
    const platformFee = this.computePlatformFee(grossAmount);
    const netAmount = Number((grossAmount - platformFee).toFixed(2));

    return {
      grossAmount,
      platformFee,
      netAmount,
    };
  }

  private computePlatformFee(amount: number): number {
    if (amount <= 500) {
      return Number(Math.min(50, amount).toFixed(2));
    }

    return Number((amount * 0.13).toFixed(2));
  }
}
