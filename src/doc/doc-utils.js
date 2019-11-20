"use strict";

// Using a unique object to compare by reference.
const traverseDocOnExitStackMarker = {};

function traverseDoc(doc, onEnter, onExit, shouldTraverseConditionalGroups) {
  const docsStack = [doc];

  while (docsStack.length !== 0) {
    const doc = docsStack.pop();

    if (doc === traverseDocOnExitStackMarker) {
      onExit(docsStack.pop());
      continue;
    }

    let shouldRecurse = true;
    if (onEnter) {
      if (onEnter(doc) === false) {
        shouldRecurse = false;
      }
    }

    if (onExit) {
      docsStack.push(doc);
      docsStack.push(traverseDocOnExitStackMarker);
    }

    if (shouldRecurse) {
      // When there are multiple parts to process,
      // the parts need to be pushed onto the stack in reverse order,
      // so that they are processed in the original order
      // when the stack is popped.
      if (doc.type === "concat" || doc.type === "fill") {
        for (let ic = doc.parts.length, i = ic - 1; i >= 0; --i) {
          docsStack.push(doc.parts[i]);
        }
      } else if (doc.type === "if-break") {
        if (doc.flatContents) {
          docsStack.push(doc.flatContents);
        }
        if (doc.breakContents) {
          docsStack.push(doc.breakContents);
        }
      } else if (doc.type === "group" && doc.expandedStates) {
        if (shouldTraverseConditionalGroups) {
          for (let ic = doc.expandedStates.length, i = ic - 1; i >= 0; --i) {
            docsStack.push(doc.expandedStates[i]);
          }
        } else {
          docsStack.push(doc.contents);
        }
      } else if (doc.contents) {
        docsStack.push(doc.contents);
      }
    }
  }
}

function mapDoc(doc, cb) {
  if (doc.type === "concat" || doc.type === "fill") {
    const parts = doc.parts.map(part => mapDoc(part, cb));
    return cb(Object.assign({}, doc, { parts }));
  } else if (doc.type === "if-break") {
    const breakContents = doc.breakContents && mapDoc(doc.breakContents, cb);
    const flatContents = doc.flatContents && mapDoc(doc.flatContents, cb);
    return cb(Object.assign({}, doc, { breakContents, flatContents }));
  } else if (doc.contents) {
    const contents = mapDoc(doc.contents, cb);
    return cb(Object.assign({}, doc, { contents }));
  }
  return cb(doc);
}

function findInDoc(doc, fn, defaultValue) {
  let result = defaultValue;
  let hasStopped = false;
  function findInDocOnEnterFn(doc) {
    const maybeResult = fn(doc);
    if (maybeResult !== undefined) {
      hasStopped = true;
      result = maybeResult;
    }
    if (hasStopped) {
      return false;
    }
  }
  traverseDoc(doc, findInDocOnEnterFn);
  return result;
}

function isEmpty(n) {
  return typeof n === "string" && n.length === 0;
}

function isLineNextFn(doc) {
  if (typeof doc === "string") {
    return false;
  }
  if (doc.type === "line") {
    return true;
  }
}

function isLineNext(doc) {
  return findInDoc(doc, isLineNextFn, false);
}

function willBreakFn(doc) {
  if (doc.type === "group" && doc.break) {
    return true;
  }
  if (doc.type === "line" && doc.hard) {
    return true;
  }
  if (doc.type === "break-parent") {
    return true;
  }
}

function willBreak(doc) {
  return findInDoc(doc, willBreakFn, false);
}

function breakParentGroup(groupStack) {
  if (groupStack.length > 0) {
    const parentGroup = groupStack[groupStack.length - 1];
    // Breaks are not propagated through conditional groups because
    // the user is expected to manually handle what breaks.
    if (!parentGroup.expandedStates) {
      parentGroup.break = true;
    }
  }
  return null;
}

function propagateBreaks(doc) {
  const alreadyVisitedSet = new Set();
  const groupStack = [];
  function propagateBreaksOnEnterFn(doc) {
    if (doc.type === "break-parent") {
      breakParentGroup(groupStack);
    }
    if (doc.type === "group") {
      groupStack.push(doc);
      if (alreadyVisitedSet.has(doc)) {
        return false;
      }
      alreadyVisitedSet.add(doc);
    }
  }
  function propagateBreaksOnExitFn(doc) {
    if (doc.type === "group") {
      const group = groupStack.pop();
      if (group.break) {
        breakParentGroup(groupStack);
      }
    }
  }
  traverseDoc(
    doc,
    propagateBreaksOnEnterFn,
    propagateBreaksOnExitFn,
    /* shouldTraverseConditionalGroups */ true
  );
}

function removeLinesFn(doc) {
  // Force this doc into flat mode by statically converting all
  // lines into spaces (or soft lines into nothing). Hard lines
  // should still output because there's too great of a chance
  // of breaking existing assumptions otherwise.
  if (doc.type === "line" && !doc.hard) {
    return doc.soft ? "" : " ";
  } else if (doc.type === "if-break") {
    return doc.flatContents || "";
  }
  return doc;
}

function removeLines(doc) {
  return mapDoc(doc, removeLinesFn);
}

function stripTrailingHardline(doc) {
  // HACK remove ending hardline, original PR: #1984
  if (doc.type === "concat" && doc.parts.length !== 0) {
    const lastPart = doc.parts[doc.parts.length - 1];
    if (lastPart.type === "concat") {
      if (
        lastPart.parts.length === 2 &&
        lastPart.parts[0].hard &&
        lastPart.parts[1].type === "break-parent"
      ) {
        return { type: "concat", parts: doc.parts.slice(0, -1) };
      }

      return {
        type: "concat",
        parts: doc.parts.slice(0, -1).concat(stripTrailingHardline(lastPart))
      };
    }
  }

  return doc;
}

module.exports = {
  isEmpty,
  willBreak,
  isLineNext,
  traverseDoc,
  findInDoc,
  mapDoc,
  propagateBreaks,
  removeLines,
  stripTrailingHardline
};
