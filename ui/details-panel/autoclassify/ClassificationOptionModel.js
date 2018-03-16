import { extendProperties } from "../../helpers/objectHelper";

/**
 * Classification option model
 */
export default class ClassificationOptionModel {
  constructor(type, id, classifiedFailureId, bugNumber,
              bugSummary, bugResolution, matches) {
    extendProperties(this, {
      type: type,
      id: id,
      classifiedFailureId: classifiedFailureId || null,
      bugNumber: bugNumber || null,
      bugSummary: bugSummary || null,
      bugResolution: bugResolution || null,
      matches: matches || null,
      isBest: false,
      hidden: false,
      score: null,
      selectable: !(type === "classifiedFailure" && !bugNumber)
    });
  }
}

