start
  = (ws e:expr ws { return e; })*

expr
  = comment
  / cmd:(or/comparison/method) ws ";"? { return cmd; }

comparison
  = left:(method/literal) ws "==" ws right:(method/literal) { return {expr: 'oper', oper: '==', left: left, right: right}; }

or
  = left:(comparison/method) right:(ws "||" ws m:(comparison/method) { return m; })+ { return {expr: 'or', args: [left].concat(right)}; }

method
  = name:method_name "(" args:(ws a:argument ws ","? { return a; })* ")" { return {expr: 'method', name: name, args: args, start: location().start, raw: text()}; }

method_name
  = chars:[a-zA-Z0-9\-_\.]+ { return chars.join(''); }

argument
  = concatenation
  / method
  / literal

concatenation
  = left:(method/literal) right:(ws "+" ws v:(method/literal) { return v; })+ { return {expr: 'concat', args: [left].concat(right)}; }

literal
  = octal
  / number
  / hex
  / string

octal
  = "0" chars:[0-9]+ ![a-zA-Z] { var oct = "0" + chars.join(''); return {expr: 'octal', oct: oct, dec: parseInt(oct, 8)}; }

hex
  = "0x"? chars:[a-f0-9]+ { var hex = chars.join(''); return {expr: 'hex', hex: hex, dec: parseInt(hex, 16)}; }

string
  = '"' chars:quoted_char* '"' { return chars.join(''); }

number
  = chars:[0-9\.]+ ![a-zA-Z] { return parseFloat(chars.join('')); }

comment
  = "#" chars:[^\n]* { return {expr: 'comment', text: chars.join('').trim()}; }

quoted_char
  = [^"\\]
  / escaped_char

escaped_char
  = '\\' c:. { return c; }

ws
  = (" "/"\n"/"\t")*
