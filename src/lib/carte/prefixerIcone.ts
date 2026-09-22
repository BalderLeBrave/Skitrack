/**
 * Préfixe le nom d'icône que produit une expression `icon-image`.
 *
 * Deux sprites (OpenFreeMap pour le fond, le nôtre pour le ski) veulent deux
 * préfixes — `ofm:` et `ski:` — et MapLibre exige que chaque nom d'icône le
 * porte. Un littéral se préfixe. Une expression, non : envelopper
 * `["step", ["zoom"], …]` dans un `concat` est refusé (« "zoom" expression
 * may only be used as input to a top-level "step" »), et une valeur vide
 * (« pas d'icône ») deviendrait `ofm:`, une icône manquante. Le préfixe est
 * donc porté aux **sorties** de l'expression, en descendant : les branches
 * d'un `step`, d'un `match`, d'un `case`, d'un `coalesce` ; un `concat`
 * reçoit le préfixe en tête ; toute autre expression (`get`, `to-string`) est
 * enveloppée. Une sortie vide reste vide.
 */

export type Expr = unknown;

export function prefixerIcone(expr: Expr, prefixe: string): Expr {
  if (typeof expr === "string") return expr ? prefixe + expr : expr;
  if (!Array.isArray(expr) || typeof expr[0] !== "string") return expr;
  const [op, ...args] = expr as [string, ...Expr[]];
  const sur = (x: Expr) => prefixerIcone(x, prefixe);
  switch (op) {
    case "step": {
      // ["step", entrée, sortie0, borne1, sortie1, …]
      const [entree, sortie0, ...reste] = args;
      return ["step", entree, sur(sortie0), ...reste.map((x, i) => (i % 2 === 1 ? sur(x) : x))];
    }
    case "match": {
      // ["match", entrée, étiquettes1, sortie1, …, repli]
      const [entree, ...reste] = args;
      const repli = reste[reste.length - 1];
      const paires = reste.slice(0, -1).map((x, i) => (i % 2 === 1 ? sur(x) : x));
      return ["match", entree, ...paires, sur(repli)];
    }
    case "case": {
      // ["case", condition1, sortie1, …, repli]
      const repli = args[args.length - 1];
      const paires = args.slice(0, -1).map((x, i) => (i % 2 === 1 ? sur(x) : x));
      return ["case", ...paires, sur(repli)];
    }
    case "coalesce":
      return ["coalesce", ...args.map(sur)];
    case "concat":
      return ["concat", prefixe, ...args];
    default:
      return ["concat", prefixe, expr];
  }
}

/** Les littéraux que l'expression peut rendre — pour vérifier les préfixes. */
export function sortiesIcone(expr: Expr): string[] {
  if (typeof expr === "string") return [expr];
  if (!Array.isArray(expr) || typeof expr[0] !== "string") return [];
  const [op, ...args] = expr as [string, ...Expr[]];
  switch (op) {
    case "step": {
      const [, sortie0, ...reste] = args;
      return [...sortiesIcone(sortie0), ...reste.filter((_, i) => i % 2 === 1).flatMap(sortiesIcone)];
    }
    case "match": {
      const [, ...reste] = args;
      const repli = reste[reste.length - 1];
      return [...reste.slice(0, -1).filter((_, i) => i % 2 === 1).flatMap(sortiesIcone), ...sortiesIcone(repli)];
    }
    case "case": {
      const repli = args[args.length - 1];
      return [...args.slice(0, -1).filter((_, i) => i % 2 === 1).flatMap(sortiesIcone), ...sortiesIcone(repli)];
    }
    case "coalesce":
      return args.flatMap(sortiesIcone);
    case "concat":
      // Le premier terme dit le préfixe ; le reste est calculé.
      return typeof args[0] === "string" ? [args[0] + "…"] : ["…"];
    default:
      return ["…"];
  }
}
