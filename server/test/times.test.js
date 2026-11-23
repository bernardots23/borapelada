import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortearTimes } from '../src/services/times.js';

const gerar = (niveis) => niveis.map((nivel, i) => ({ usuarioId: String(i), nome: `J${i}`, nivel }));
const diff = (times) => {
  const s = times.map((t) => t.somaNiveis);
  return Math.max(...s) - Math.min(...s);
};

/** Menor diferença possível para 2 times (busca exaustiva — usada só no teste). */
function otimo2Times(niveis) {
  const n = niveis.length;
  const tamA = Math.ceil(n / 2);
  const total = niveis.reduce((a, b) => a + b, 0);
  let melhor = Infinity;
  for (let mask = 0; mask < 1 << n; mask++) {
    let bits = 0;
    let s = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { bits++; s += niveis[i]; }
    if (bits !== tamA) continue;
    melhor = Math.min(melhor, Math.abs(total - 2 * s));
  }
  return melhor;
}

test('CA06.1: 14 confirmados em 2 times geram 2 times de 7', () => {
  const times = sortearTimes(gerar([5, 5, 4, 4, 4, 3, 3, 3, 3, 2, 2, 2, 1, 1]), 2);
  assert.equal(times.length, 2);
  assert.deepEqual(times.map((t) => t.jogadores.length), [7, 7]);
});

test('CA06.2: escolhe a menor diferença possível (comparado com busca exaustiva)', () => {
  for (let k = 0; k < 400; k++) {
    const n = 8 + Math.floor(Math.random() * 7); // 8 a 14 jogadores
    const niveis = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 5));
    const obtido = diff(sortearTimes(gerar(niveis), 2));
    assert.equal(obtido, otimo2Times(niveis), `niveis=${niveis}`);
  }
});

test('CA06.2: grupo com níveis variados (14 jogadores) fica com diferença ≤ 2', () => {
  const times = sortearTimes(gerar([5, 5, 4, 4, 4, 3, 3, 3, 3, 2, 2, 2, 1, 1]), 2);
  assert.ok(diff(times) <= 2);
});

test('CA06.3: número ímpar de jogadores — diferença de no máximo 1 jogador', () => {
  for (const qtd of [2, 3, 4]) {
    const times = sortearTimes(gerar(Array(15).fill(3)), qtd);
    const tam = times.map((t) => t.jogadores.length);
    assert.ok(Math.max(...tam) - Math.min(...tam) <= 1);
    assert.equal(tam.reduce((a, b) => a + b), 15);
  }
});

test('todos os jogadores aparecem exatamente uma vez', () => {
  const jogadores = gerar([5, 4, 3, 2, 1, 5, 4, 3, 2, 1, 3, 3]);
  const ids = sortearTimes(jogadores, 3).flatMap((t) => t.jogadores.map((j) => j.usuarioId)).sort();
  assert.deepEqual(ids, jogadores.map((j) => j.usuarioId).sort());
});
