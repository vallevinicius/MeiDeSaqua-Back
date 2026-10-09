// src/utils/ProfanityFilter.ts

const PALAVRAS_PROIBIDAS: string[] = [
    // Lista Original (já aprimorada)
    "arrombada", "arrombadas", "arrombado", "babaca", "bacurinha", "baitola",
    "bichona", "bixa", "boceta", "boiola", "bolcinha", "bolsinha", "boquete",
    "boqueteira", "boqueteiro", "boquetera", "boquetero", "boquetes", "bosta",
    "brecheca", "bucefula", "buceta", "bucetao", "bucetas", "bucetasso",
    "bucetinha", "bucetinhas", "bucetonas", "cacete", "cachuleta", "cagalhao",
    "carai", "caraio", "caralha", "caralho", "caralhudo", "cassete", "cequelada",
    "cequelado", "chalerinha", "chatico", "chavasca", "checheca", "chereca",
    "chibio", "chimbica", "chupada", "chupador", "chupadora", "chupando",
    "chupeta", "chupetinha", "chupou", "porra", "crossdresser", "cu",
    "cuecao", "custozinha", "cuzao", "cuzinho", "cuzinhos", "dadeira",
    "encoxada", "enrabadas", "fornicada", "fudendo", "fudido", "furustreca",
    "gostozudas", "gozada", "gozadas", "greludas", "gulosinha", "katchanga",
    "bilau", "lesbofetiche", "lixa-pica", "mede-rola", "megasex",
    "mela-pentelho", "meleca", "melequinha", "menage", "menages", "merda",
    "merdao", "meretriz", "metendo", "mijada", "otario", "papa-duro", "pau",
    "pausudas", "pechereca", "peidao", "peido", "peidorreiro", "peitos",
    "peituda", "peitudas", "periquita", "pica", "piranhuda", "piriguetes",
    "piroca", "pirocao", "pirocas", "pirocudo", "pitbitoca", "pitchbicha",
    "pitchbitoca", "pithbicha", "pithbitoca", "pitibicha", "pitrica", "pixota",
    "prencheca", "prexeca", "priquita", "priquito", "punheta", "punheteiro",
    "pussy", "puta", "putaria", "putas", "putinha", "quenga", "rabuda",
    "rabudas", "rameira", "rapariga", "retardado", "saca-rola", "safada",
    "safadas", "safado", "safados", "sequelada", "sexboys", "sexgatas",
    "sirica", "siririca", "sotravesti", "suruba", "surubas", "taioba",
    "tarada", "tchaca", "tcheca", "tchonga", "tchuchuca", "tchutchuca",
    "tesuda", "tesudas", "tesudo", "tetinha", "tezao", "tezuda", "tezudo",
    "tgatas", "t-girls", "tobinha", "tomba-macho", "topsexy", "transa",
    "transando", "travecas", "traveco", "travecos", "trepada", "trepadas",
    "vacilao", "vadjaina", "vadia", "vagabunda", "vagabundo", "vaginismo",
    "vajoca", "veiaca", "veiaco", "viadinho", "viado", "xabasca", "xana",
    "xaninha", "xatico", "xavasca", "xebreca", "xereca", "xexeca", "xibio",
    "xoroca", "xota", "xotinha", "xoxota", "xoxotas", "xoxotinha", "xulipa",
    "xumbrega", "xupaxota", "xupeta", "xupetinha", "krl", "kct", "vsf",
    "fdp", "tnc", "pqp", "filadaputa", "tomarnocu", "vaisifoder",

    // Novas palavras e abreviações adicionadas
    "anus", "bagos", "bronha", "burra", "burro", "canalha", "chifruda",
    "chifrudo", "clitoris", "cocaina", "coco", "corna", "corno", "cornudo",
    "cretino", "cretina", "crlh", "desgraca", "drogado", "energumeno", "enfia",
    "escrota", "escroto", "estupida", "estupidez", "estupido", "estupro", "fiofo",
    "fodase", "fodeu", "fornicar", "fudida", "fudido", "furo", "furona", "furnicar",
    "gaiato", "gay", "gonorreia", "grelinho", "grelo", "gozar", "herege", "idiota",
    "idiotice", "imbecil", "iscroto", "ladrao", "lambe", "lesbica", "lixo", "macaca",
    "macaco", "maconha", "masturba", "masturbacao", "merdinha", "mijo", "mocreia",
    "mongol", "nadegas", "nojenta", "nojento", "otaria", "paspalhao", "pemba", "penis",
    "pentelha", "pentelho", "peru", "picao", "pila", "pinto", "pintudo", "piranha",
    "piru", "porno", "prr", "prega", "prostituta", "prostituto", "punheteiro",
    "pustula", "putaquepariu", "puto", "puxasaco", "rabo", "rabudo", "racha",
    "retardada", "ridicula", "ridiculo", "rola", "rosca", "sapatao", "tarado",
    "testuda", "transar", "trocha", "troucha", "trouxa", "troxa", "trolha",
    "vaca", "vagina", "veada", "veado", "verme", "vigarista", "vtc", "vtmnc", "fode", "foder", "fuder",
    "fudor", "fudera", "fuderam", "fudendo", "fudidao", "fudidoes", "fudidos", "fudida", "fudidas",
    "fuderao", "fuderam", "fuderia", "fuderia", "fuderiao", "fuderiamos", "fudermos", "fuderem", "fuderemnos",
    "fudesse", "fudesses", "fuderia", "fuderiam", "fuderias", "fodido", "fodida", "fodidos", "fodidas",
    "foderao", "foderam", "foderia", "foderiam", "foderias", "fodermos", "foderem", "foderemnos",
    "fodesse", "fodesses", "fodidao", "fodidoes", "fodidos", "fodidas"
];

class ProfanityFilter {
    private profanityRegex: RegExp;

    constructor() {
        // Normaliza as palavras da lista (remove acentos) para a regex
        const normalizedWords = PALAVRAS_PROIBIDAS.map(palavra =>
            palavra.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        );
        
        // Cria a string da regex com bordas de palavra (\b) para garantir que palavras inteiras sejam correspondidas
        // Ex: \b(cu|bosta|merda)\b
        const regexString = `\\b(${normalizedWords.join('|')})\\b`;

        // Compila a regex de forma otimizada, 'gi' -> global e case-insensitive
        this.profanityRegex = new RegExp(regexString, 'gi');
    }
    
    /**
     * Remove acentos e converte para minúsculas para uma comparação eficaz
     */
    private normalizarTexto(input: string): string {
        return input
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    public contemPalavrao(texto: string): boolean {
        if (!texto || texto.trim() === "") {
            return false;
        }

        const textoNormalizado = this.normalizarTexto(texto);

        // Usa a regex para testar se alguma das palavras proibidas existe como uma "palavra inteira"
        // Reiniciamos o lastIndex para garantir consistência em múltiplas chamadas
        this.profanityRegex.lastIndex = 0;
        return this.profanityRegex.test(textoNormalizado);
    }
}

export default new ProfanityFilter();   