const normalize = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const assistantRequestsPlanConfirmation = (value: string) => {
  const text = normalize(value);
  if (!text) return false;

  if (
    /\b(plan|te recomiendo|propongo|podemos usar|podemos combinar|mi recomendacion|te parece|si te parece|cuando confirmes|cuando me confirmes|quedaria asi|generare la timeline|generare el video)\b/.test(text)
  ) {
    return true;
  }

  if (
    /\b(?:dime|di|responde|escribe|confirma)(?:\s+[a-z0-9]+){0,5}\s+(?:dale|adelante|hazlo|procede)\b/.test(text)
  ) {
    return true;
  }

  if (
    /\bcuando estes listo\b(?:\s+[a-z0-9]+){0,8}\s+(?:dale|adelante|confirm)/.test(text)
  ) {
    return true;
  }

  if (
    /\b(?:dale|adelante)\b(?:\s+[a-z0-9]+){0,8}\b(?:ejecut|gener|render|proces|guard)/.test(text)
  ) {
    return true;
  }

  return false;
};


export const isUniversalNaylaConfirmation = (value: string) => {
  const text = normalize(value);
  if (!text) return false;

  return (
    /^(si|si dale|ok|okay|dale|adelante|listo|perfecto|correcto|hazlo|procede|confirmo|acepto|continua|continua con el plan|sigue|sigue con el plan|adelante con el plan)$/.test(text) ||
    /\b(hazlo|procede|ejecuta|ejecuta el plan|continua con el plan|sigue con el plan|aplica el plan|confirmo|acepto|adelante con el plan|manda adelante|envialo)\b/.test(text)
  );
};
