import { ba as baseFor, aE as keysIn, bb as baseForOwn, ay as baseIteratee, bc as baseAssignValue, au as identity, aI as isSymbol, aA as arrayMap, av as isArray, bd as baseGet, be as baseUnary, bf as baseMap, aD as isIterateeCall, aC as baseRest, bg as baseFlatten, bh as toString, bi as assignValue } from "./index-CEiunyEa.js";
import { c as castFunction } from "./reduce-DTIDu9nM.js";
import { b as baseExtremum, a as baseLt, t as toFinite } from "./min-j-9kvY-u.js";
function forIn(object, iteratee) {
  return object == null ? object : baseFor(object, castFunction(iteratee), keysIn);
}
function forOwn(object, iteratee) {
  return object && baseForOwn(object, castFunction(iteratee));
}
function baseGt(value, other) {
  return value > other;
}
function mapValues(object, iteratee) {
  var result = {};
  iteratee = baseIteratee(iteratee);
  baseForOwn(object, function(value, key, object2) {
    baseAssignValue(result, key, iteratee(value, key, object2));
  });
  return result;
}
function max(array) {
  return array && array.length ? baseExtremum(array, identity, baseGt) : void 0;
}
function minBy(array, iteratee) {
  return array && array.length ? baseExtremum(array, baseIteratee(iteratee), baseLt) : void 0;
}
function baseSortBy(array, comparer) {
  var length = array.length;
  array.sort(comparer);
  while (length--) {
    array[length] = array[length].value;
  }
  return array;
}
function compareAscending(value, other) {
  if (value !== other) {
    var valIsDefined = value !== void 0, valIsNull = value === null, valIsReflexive = value === value, valIsSymbol = isSymbol(value);
    var othIsDefined = other !== void 0, othIsNull = other === null, othIsReflexive = other === other, othIsSymbol = isSymbol(other);
    if (!othIsNull && !othIsSymbol && !valIsSymbol && value > other || valIsSymbol && othIsDefined && othIsReflexive && !othIsNull && !othIsSymbol || valIsNull && othIsDefined && othIsReflexive || !valIsDefined && othIsReflexive || !valIsReflexive) {
      return 1;
    }
    if (!valIsNull && !valIsSymbol && !othIsSymbol && value < other || othIsSymbol && valIsDefined && valIsReflexive && !valIsNull && !valIsSymbol || othIsNull && valIsDefined && valIsReflexive || !othIsDefined && valIsReflexive || !othIsReflexive) {
      return -1;
    }
  }
  return 0;
}
function compareMultiple(object, other, orders) {
  var index = -1, objCriteria = object.criteria, othCriteria = other.criteria, length = objCriteria.length, ordersLength = orders.length;
  while (++index < length) {
    var result = compareAscending(objCriteria[index], othCriteria[index]);
    if (result) {
      if (index >= ordersLength) {
        return result;
      }
      var order = orders[index];
      return result * (order == "desc" ? -1 : 1);
    }
  }
  return object.index - other.index;
}
function baseOrderBy(collection, iteratees, orders) {
  if (iteratees.length) {
    iteratees = arrayMap(iteratees, function(iteratee) {
      if (isArray(iteratee)) {
        return function(value) {
          return baseGet(value, iteratee.length === 1 ? iteratee[0] : iteratee);
        };
      }
      return iteratee;
    });
  } else {
    iteratees = [identity];
  }
  var index = -1;
  iteratees = arrayMap(iteratees, baseUnary(baseIteratee));
  var result = baseMap(collection, function(value, key, collection2) {
    var criteria = arrayMap(iteratees, function(iteratee) {
      return iteratee(value);
    });
    return { "criteria": criteria, "index": ++index, "value": value };
  });
  return baseSortBy(result, function(object, other) {
    return compareMultiple(object, other, orders);
  });
}
var nativeCeil = Math.ceil, nativeMax = Math.max;
function baseRange(start, end, step, fromRight) {
  var index = -1, length = nativeMax(nativeCeil((end - start) / (step || 1)), 0), result = Array(length);
  while (length--) {
    result[++index] = start;
    start += step;
  }
  return result;
}
function createRange(fromRight) {
  return function(start, end, step) {
    if (step && typeof step != "number" && isIterateeCall(start, end, step)) {
      end = step = void 0;
    }
    start = toFinite(start);
    if (end === void 0) {
      end = start;
      start = 0;
    } else {
      end = toFinite(end);
    }
    step = step === void 0 ? start < end ? 1 : -1 : toFinite(step);
    return baseRange(start, end, step);
  };
}
var range = createRange();
var sortBy = baseRest(function(collection, iteratees) {
  if (collection == null) {
    return [];
  }
  var length = iteratees.length;
  if (length > 1 && isIterateeCall(collection, iteratees[0], iteratees[1])) {
    iteratees = [];
  } else if (length > 2 && isIterateeCall(iteratees[0], iteratees[1], iteratees[2])) {
    iteratees = [iteratees[0]];
  }
  return baseOrderBy(collection, baseFlatten(iteratees, 1), []);
});
var idCounter = 0;
function uniqueId(prefix) {
  var id = ++idCounter;
  return toString(prefix) + id;
}
function baseZipObject(props, values, assignFunc) {
  var index = -1, length = props.length, valsLength = values.length, result = {};
  while (++index < length) {
    var value = index < valsLength ? values[index] : void 0;
    assignFunc(result, props[index], value);
  }
  return result;
}
function zipObject(props, values) {
  return baseZipObject(props || [], values || [], assignValue);
}
export {
  minBy as a,
  mapValues as b,
  forOwn as c,
  forIn as f,
  max as m,
  range as r,
  sortBy as s,
  uniqueId as u,
  zipObject as z
};
