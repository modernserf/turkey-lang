// run me with `/usr/local/opt/bison/bin/bison -Wall -Wcounterexamples -o /dev/null test.y`
%token NUMBER STRING IDENT TYPE_IDENT LINE

%left "+" "-"
%left "*" "/"
%right "**"
%precedence PREFIX
%%

// statements

stmt: expr
  | "let" let_binding "=" expr
  | "func" IDENT type_params func_params block
  | "for" binding "in" expr "do" block
  | "while" expr "do" block
  | "break"
  | "continue"
  | "return"
  | "return" expr
  | "type" type_ident "=" type_expr
  | "enum" type_ident "with" enum_cases "end"
  | "struct" type_ident type_body
  | "trait" type_ident "do" block
  | "impl" type_params type_expr "for" type_expr "do" block
  | "module" TYPE_IDENT
  | "module" TYPE_IDENT "do" block
  | "import" import
  | "import" import "from" STRING
  ;

let_binding: binding
  | binding ":" type_expr
  ;

func_params: "(" func_params_next ":" type_expr;
func_params_next: ")"
  | func_binding ")"
  | func_binding "," func_params_next
  ;
func_binding: binding ":" type_expr;

enum_cases: %empty
  | enum_case enum_cases;
enum_case: "case" TYPE_IDENT type_body;

import: import_path
  | import_path "as" TYPE_IDENT
  ;
import_path: TYPE_IDENT
  | TYPE_IDENT "::" import_path_next
  ;
import_path_next: TYPE_IDENT
  | IDENT
  | "{" import_record
  | TYPE_IDENT "::" import_path_next
  ;
import_record: "}"
  | import "}"
  | import "," import_record
  ;

// expressions

expr: base_expr
  | expr "+" expr
  | expr "-" expr
  | expr "*" expr
  | expr "/" expr
  | expr "**" expr
  | "-" expr %prec PREFIX
  | "!" expr %prec PREFIX
  ;

base_expr: "(" expr ")"
  | NUMBER
  | STRING
  | ident
  | type_ident
  | record
  | tuple
  | list
  | closure
  | "if" if_cond "then" if_next
  | "match" expr "with" match_cases "end"
  | "do" block
  | base_expr args
  | base_expr _ "." ident args
  | base_expr ":" field
  | base_expr "as" type_expr
  ;

field: IDENT | NUMBER;  // TODO keywords

tuple: "#(" tuple_next;
tuple_next: ")"
  | expr ")"
  | expr "," tuple_next
  ;

ident: IDENT
  | TYPE_IDENT "::" ident
  ;

record: type_ident "{" record_next;
record_next: "}"
  | record_field "}"
  | record_field "," record_next
  ;
record_field: field ":" expr;

closure: "|" closure_params "{" closure_body;
closure_params: "|"
  | binding "|"
  | binding "," closure_params
  ;
closure_body: "}"
  | stmt "}"
  | stmt LINE closure_body
  ;

list: "#[" list_next
  | type_ident "[" list_next
  ;
list_next: "]"
  | expr "]"
  | expr "," list_next
  ; 

if_cond: expr 
  | "let" let_binding "=" expr
  ;
if_next: if_else
  | stmt if_else
  | stmt LINE if_next
  ;
if_else: "end"
  | "elif" if_cond "then" if_next
  | "else" block;
  ;

match_cases: %empty
  | "case" binding "do" block match_cases
  ;

args: "(" args_next;
args_next: ")"
  | expr ")"
  | expr "," args_next
  ;

block: "end"
  | stmt "end"
  | stmt LINE block
  ;

// bindings

binding: IDENT
  | "{" binding_fields
  | type_ident "{" binding_fields
  | type_ident "(" binding_args
  ;
binding_fields: "}"
  | binding_field "}"
  | binding_field "," binding_fields
  ;
binding_field: IDENT
  | field ":" binding
  ;
binding_args: ")"
  | binding ")"
  | binding "," binding_args
  ;
  

// types
type_ident: TYPE_IDENT
  | TYPE_IDENT "::" type_ident
  ;

type_expr: TYPE_IDENT type_params
  | "(" type_tuple_body
  | "func" type_params func_params
  ;

type_params: %empty
  | "[" type_params_next
  ;
type_params_next: "]"
  | type_param "]"
  | type_param "," type_params_next
  ;
type_param: TYPE_IDENT
  | TYPE_IDENT ":" trait_expr
  ;
trait_expr: type_expr
  | type_expr "+" trait_expr
  ;

type_body: "{" type_record_body
  | "(" type_tuple_body
  ;
type_record_body: "}"
  | type_record_field "}"
  | type_record_field "," type_record_body
  ;
type_record_field: field ":" type_expr;
type_tuple_body: ")"
  | type_expr ")"
  | type_expr "," type_tuple_body;

_: %empty | LINE;