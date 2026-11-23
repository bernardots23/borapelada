/**
 * Sorteio de times equilibrados (RF16 / HU06).
 * - Diferença de jogadores entre times: no máximo 1 (CA06.3).
 * - Escolhe a divisão com a menor diferença possível entre a soma dos níveis (CA06.2).
 *
 * Estratégia:
 * - 2 times: solução exata (programação dinâmica), sempre a melhor divisão possível.
 * - 3 ou 4 times: várias tentativas aleatórias (distribuição gulosa + trocas) e fica a melhor.
 * A ordem é embaralhada antes, então o sorteio muda a cada vez.
 */
const nivel = (j) => j.nivel ?? 3;
const soma = (t) => t.reduce((s, j) => s + nivel(j), 0);
const diferenca = (times) => {
  const s = times.map(soma);
  return Math.max(...s) - Math.min(...s);
};

const embaralhar = (lista, aleatorio) =>
  lista.map((j) => ({ j, r: aleatorio() })).sort((a, b) => a.r - b.r).map((x) => x.j);

/**
 * 2 times: solução exata por programação dinâmica (subconjunto com tamanho fixo
 * cuja soma fica mais perto da metade). Embaralhar antes varia o sorteio entre
 * soluções igualmente equilibradas.
 */
function doisTimesExato(jogadores, tamA, aleatorio) {
  const lista = embaralhar(jogadores, aleatorio);
  const total = soma(lista);
  // alcancavel[c] = Map(soma -> índice do último jogador usado), para reconstruir
  const alc = Array.from({ length: tamA + 1 }, () => new Map());
  alc[0].set(0, -1);
  lista.forEach((j, i) => {
    for (let c = Math.min(i, tamA - 1); c >= 0; c--) {
      for (const s of [...alc[c].keys()]) {
        const ns = s + nivel(j);
        if (!alc[c + 1].has(ns)) {
          alc[c + 1].set(ns, i);
        }
      }
    }
  });
  let melhorSoma = null;
  for (const s of alc[tamA].keys()) {
    if (melhorSoma === null || Math.abs(total - 2 * s) < Math.abs(total - 2 * melhorSoma)) melhorSoma = s;
  }
  // Reconstrução: volta pelos jogadores que geraram cada estado
  const noTimeA = new Set();
  let c = tamA;
  let s = melhorSoma;
  while (c > 0) {
    const i = alc[c].get(s);
    noTimeA.add(i);
    s -= nivel(lista[i]);
    c -= 1;
  }
  return [lista.filter((_, i) => noTimeA.has(i)), lista.filter((_, i) => !noTimeA.has(i))];
}

function tentativa(jogadores, k, capacidade, aleatorio, ordenar) {
  const base = embaralhar(jogadores, aleatorio);
  const ordem = ordenar ? base.sort((a, b) => nivel(b) - nivel(a)) : base;

  const times = Array.from({ length: k }, () => []);
  for (const jogador of ordem) {
    let melhor = -1;
    for (let i = 0; i < k; i++) {
      if (times[i].length >= capacidade[i]) continue;
      if (melhor === -1 || soma(times[i]) < soma(times[melhor])) melhor = i;
    }
    times[melhor].push(jogador);
  }

  // Busca local: troca dois jogadores de times diferentes se isso reduzir a diferença
  let melhorou = true;
  while (melhorou) {
    melhorou = false;
    const atual = diferenca(times);
    for (let a = 0; a < k && !melhorou; a++) {
      for (let b = a + 1; b < k && !melhorou; b++) {
        for (let x = 0; x < times[a].length && !melhorou; x++) {
          for (let y = 0; y < times[b].length && !melhorou; y++) {
            if (nivel(times[a][x]) === nivel(times[b][y])) continue;
            [times[a][x], times[b][y]] = [times[b][y], times[a][x]];
            if (diferenca(times) < atual) melhorou = true;
            else [times[a][x], times[b][y]] = [times[b][y], times[a][x]];
          }
        }
      }
    }
  }
  return times;
}

export function sortearTimes(jogadores, quantidadeTimes = 2, aleatorio = Math.random) {
  const k = Math.max(2, Math.min(Number(quantidadeTimes) || 2, jogadores.length || 2));
  const n = jogadores.length;
  const base = Math.floor(n / k);
  const extras = n % k;
  const capacidade = Array.from({ length: k }, (_, i) => base + (i < extras ? 1 : 0));

  let melhor = null;
  if (k === 2) {
    melhor = doisTimesExato(jogadores, capacidade[0], aleatorio);
  } else {
    for (let t = 0; t < 60; t++) {
      const times = tentativa(jogadores, k, capacidade, aleatorio, t % 2 === 0);
      if (!melhor || diferenca(times) < diferenca(melhor)) melhor = times;
      if (diferenca(melhor) === 0) break;
    }
  }

  // Embaralha a ordem dos jogadores dentro de cada time (não revela quem é mais forte)
  return melhor.map((t, i) => ({
    nome: `Time ${String.fromCharCode(65 + i)}`,
    somaNiveis: soma(t),
    jogadores: t.map((j) => ({ j, r: aleatorio() })).sort((a, b) => a.r - b.r).map((x) => x.j),
  }));
}
