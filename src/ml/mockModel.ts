
/**
 * Рассчитывает рекомендуемый размер ставки на основе модели управления рисками,
 * учитывающей банк пользователя и коэффициент ставки.
 * Модель предлагает ставить меньший процент от банка на более высокие коэффициенты (более рискованные ставки),
 * чтобы обеспечить устойчивый рост в долгосрочной перспективе.
 * @param bankroll - Текущий банк игрока.
 * @param odds - Коэффициент ставки.
 * @returns Объект с рекомендуемой суммой ставки и процентом от банка, или null, если ставка не рекомендуется.
 */
export const calculateRiskManagedStake = (bankroll: number, odds: number): { stake: number; percentage: number } | null => {
  if (bankroll <= 0 || odds <= 1) {
    return null;
  }

  let percentageOfBankroll: number;

  if (odds < 1.5) {
    // Высокая вероятность, низкий риск. Ставка: 2.5% от банка.
    percentageOfBankroll = 0.025;
  } else if (odds >= 1.5 && odds < 2.5) {
    // Средний риск. Ставка: 1.5% от банка.
    percentageOfBankroll = 0.015;
  } else if (odds >= 2.5 && odds < 4.0) {
    // Повышенный риск (андердоги). Ставка: 0.75% от банка.
    percentageOfBankroll = 0.0075;
  } else { // odds >= 4.0
    // Высокий риск (дальние выстрелы). Ставка: 0.5% от банка.
    percentageOfBankroll = 0.005;
  }

  // Устанавливаем максимальный порог в 5% для предотвращения слишком крупных ставок
  const finalPercentage = Math.min(percentageOfBankroll, 0.05);
  const recommendedStake = bankroll * finalPercentage;
  
  // Не рекомендуем ставить, если рассчитанная сумма слишком мала (например, меньше 1)
  if (recommendedStake < 1) {
      return null;
  }

  return {
    stake: recommendedStake,
    percentage: finalPercentage * 100,
  };
};