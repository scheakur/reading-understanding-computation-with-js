#! iojs --harmony

'use strict';

class Struct {

  static new() {
    var props = Array.prototype.slice.call(arguments);
    return class {

      constructor() {
        var args = Array.prototype.slice.call(arguments);
        props.forEach(function(property, index) {
          this[property] = args[index];
        }, this);
      }

      inspect() {
        return `«${this.toString()}»`;
      }

    };
  }

}


class Machine extends Struct.new('statement', 'env') {

  step() {
    var reduced = this.statement.reduce(this.env);
    this.statement = reduced[0];
    this.env = reduced[1];
  }

  run() {
    console.log('--- run ---');
    while (this.statement.reducible()) {
      console.log(this.statement, this.env);
      this.step();
    }
    console.log(this.statement, this.env);
    console.log('--- end ---');
  }

}


class Number extends Struct.new('value') {

  toString() {
    return String(this.value);
  }

  reducible() {
    return false;
  }

  evaluate(env) {
    return this;
  }

  toJs() {
    return `(function(e) { return ${this} })`;
  }

}


class Add extends Struct.new('left', 'right') {

  toString() {
    return `${this.left} + ${this.right}`;
  }

  reducible() {
    return true;
  }

  reduce(env) {
    if (this.left.reducible()) {
      return new Add(this.left.reduce(env), this.right);
    }
    if (this.right.reducible()) {
      return new Add(this.left, this.right.reduce(env));
    }
    return new Number(this.left.value + this.right.value);
  }

  evaluate(env) {
    return new Number(this.left.evaluate(env).value + this.right.evaluate(env).value);
  }

  toJs() {
    return `(function(e) { return ${this.left.toJs()}(e) + ${this.right.toJs()}(e); })`;
  }

}


class Multiply extends Struct.new('left', 'right') {

  toString() {
    return `${this.left} * ${this.right}`;
  }

  reducible() {
    return true;
  }

  reduce(env) {
    if (this.left.reducible()) {
      return new Multiply(this.left.reduce(env), this.right);
    }
    if (this.right.reducible()) {
      return new Multiply(this.left, this.right.reduce(env));
    }
    return new Number(this.left.value * this.right.value);
  }

  evaluate(env) {
    return new Number(this.left.evaluate(env).value * this.right.evaluate(env).value);
  }

  toJs() {
    return `(function(e) { return ${this.left.toJs()}(e) * ${this.right.toJs()}(e); })`;
  }

}


class Boolean extends Struct.new('value') {

  toString() {
    return this.value;
  }

  reducible() {
    return false;
  }

  evaluate(env) {
    return this;
  }

  toJs() {
    return `(function(e) { return ${this}; })`;
  }

}


class LessThan extends Struct.new('left', 'right') {

  toString() {
    return `${this.left} < ${this.right}`;
  }

  reducible() {
    return true;
  }

  reduce(env) {
    if (this.left.reducible()) {
      return new LessThan(this.left.reduce(env), this.right);
    }
    if (this.right.reducible()) {
      return new LessThan(this.left, this.right.reduce(env));
    }
    return new Boolean(this.left.value < this.right.value);
  }

  evaluate(env) {
    return new Boolean(this.left.evaluate(env).value < this.right.evaluate(env).value);
  }

  toJs() {
    return `(function(e) { return ${this.left.toJs()}(e) < ${this.right.toJs()}(e); })`;
  }

}


class Variable extends Struct.new('name') {

  toString() {
    return `${this.name}`;
  }

  reducible() {
    return true;
  }

  reduce(env) {
    return env[this.name];
  }

  evaluate(env) {
    return env[this.name];
  }

  toJs() {
    return `(function(e) { return e.${this.name}; })`;
  }

}


class DoNothing extends Struct.new() {

  toString() {
    return `do-nothing`;
  }

  reducible() {
    return false;
  }

  evaluate(env) {
    return env;
  }

  toJs() {
    return `(function(e) { return e; })`;
  }

}


class Assign extends Struct.new('name', 'expression') {

  toString() {
    return `${this.name} = ${this.expression}`;
  }

  reducible() {
    return true;
  }

  reduce(env) {
    if (this.expression.reducible()) {
      return [new Assign(this.name, this.expression.reduce(env)), env];
    }
    return [new DoNothing(), merge(env, this.name,  this.expression)];
  }

  evaluate(env) {
    return merge(env, this.name, this.expression.evaluate(env));
  }

  toJs(e) {
    return `(function(e) { e.${this.name} = ${this.expression.toJs()}(e); return e; })`;
  }

}


function merge(obj, key, val) {
  obj[key] = val;
  return obj;
}


class If extends Struct.new('condition', 'consequence', 'alternative') {

  toString() {
    return `if (${this.condition}) { ${this.consequence} } else { ${this.alternative} }`;
  }

  reducible() {
    return true;
  }

  reduce(env) {
    if (this.condition.reducible()) {
      return [new If(this.condition.reduce(env), this.consequence, this.alternative), env];
    } else {
      if (this.condition.value === true) {
        return [this.consequence, env];
      }
      if (this.condition.value === false) {
        return [this.alternative, env];
      }
    }
  }

  evaluate(env) {
    var ret = this.condition.evaluate(env);
    if (ret.value === true) {
      return this.consequence.evaluate(env);
    }
    if (ret.value === false) {
      return this.alternative.evaluate(env);
    }
  }

  toJs() {
    return `(function(e) {
  if (${this.condition.toJs()}(e)) {
    return ${this.consequence.toJs()}(e);
  } else {
    return ${this.alternative.toJs()}(e);
  }
})`;
  }

}

class Sequence extends Struct.new('first', 'second') {

  toString() {
    return `${this.first}; ${this.second}`
  }

  reducible() {
    return true;
  }

  reduce(env) {
    if (this.first instanceof DoNothing) {
      return [this.second, env];
    }
    var reduced = this.first.reduce(env);
    return [new Sequence(reduced[0], this.second), reduced[1]];
  }

  evaluate(env) {
    return this.second.evaluate(this.first.evaluate(env));
  }

  toJs() {
    return `(function(e) { return ${this.second.toJs()}(${this.first.toJs()}(e)); })`;
  }

}


class While extends Struct.new('condition', 'body') {

  toString() {
    return `while (${this.condition}) { ${this.body} }`
  }

  reducible() {
    return true;
  }

  reduce(env) {
    return [new If(this.condition, new Sequence(this.body, this), new DoNothing()), env];
  }

  evaluate(env) {
    var ret = this.condition.evaluate(env);
    if (ret.value === true) {
      return this.evaluate(this.body.evaluate(env));
    }
    if (ret.value === false) {
      return env;
    }
  }

  toJs() {
    return `(function(e) { while (${this.condition.toJs()}(e)) { e = ${this.body.toJs()}(e); } return e; })`;
  }

}


// Sample

new Machine(
  new Assign('x', new Add(new Variable('x'), new Number(1))),
  { x: new Number(2) }
).run();

new Machine(
  new If(
    new Variable('x'),
    new Assign('y', new Number(1)),
    new Assign('y', new Number(2))
  ),
  { x: new Boolean(true) }
).run();

new Machine(
  new Sequence(
    new Assign('x', new Add(new Number(1), new Number(1))),
    new Assign('y', new Add(new Variable('x'), new Number(3)))
  ),
  {}
).run();

new Machine(
  new While(
    new LessThan(new Variable('x'), new Number(5)),
    new Assign('x', new Multiply(new Variable('x'), new Number(3)))
  ),
  { x: new Number(1) }
).run();

console.log(new LessThan(
  new Add(new Variable('x'), new Number(2)),
  new Variable('y')
).evaluate({ x: new Number(4), y: new Number(5) }));

console.log(new Sequence(
  new Assign('x', new Add(new Number(1), new Number(1))),
  new Assign('y', new Add(new Variable('x'), new Number(3)))
).evaluate({}));

console.log(new While(
  new LessThan(new Variable('x'), new Number(5)),
  new Assign('x', new Multiply(new Variable('x'), new Number(3)))
).evaluate({ x: new Number(1) }));

console.log(
  eval(new If(
    new Variable('x'),
    new Assign('y', new Number(1)),
    new Assign('y', new Number(2))
  ).toJs())({ x: false })
);

console.log(
  eval(new While(
    new LessThan(new Variable('x'), new Number(5)),
    new Assign('x', new Multiply(new Variable('x'), new Number(3)))
  ).toJs())({ x: 1 })
);

