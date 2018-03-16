import PropTypes from 'prop-types';
import ErrorLine from "./ErrorLine";

export default class AutoclassifyErrors extends React.Component {
  constructor(props) {
    super(props);

    this.lineStatuses = new Map();
    this.titles = {
      verified: "Verified Line",
      'unverified-ignore': "Unverified line, ignored",
      'unverified-no-bug': "Unverified line missing a bug number",
      unverified: "Unverified line",
      'classification-disabled': ""
    };
  }

  /**
   * Toggle the selection of a ErrorLine, if the click didn't happen on an interactive
   * element child of that line.
   */
  toggleSelect(event, id) {
    // let elem = $(event.target);
    // const interactive = new Set(["INPUT", "BUTTON", "TEXTAREA", "A"]);
    // while (elem.length && elem[0] !== element[0]) {
    //     if (interactive.has(elem.prop("tagName"))) {
    //         return;
    //     }
    //     elem = elem.parent();
    // }
    this.props.onToggleSelect({ lineIds: [id], clear: !event.ctrlKey && !event.metaKey });
  }

  render() {
    const {
      job, loadStatus, errorMatchers, errorLines, selectedLineIds,
      editableLineIds, canClassify, // onUpdateLine, onLineEditableChange,
    } = this.props;

    return (
      <span className="autoclassify-errors">
        {loadStatus === 'ready' && <ul className="list-unstyled">
          {errorLines.map((errorLine, idx) => (<li>
            <ErrorLine
              title={this.lineStatuses.has(errorLine.id) ? this.titles[this.lineStatuses.get(errorLine.id)] : ''}
              onClick={event => this.toggleSelect(event, errorLine.id)}
              className={selectedLineIds.has(errorLine.id) ? 'selected' : ''}
              job={job}
              errorMatchers={errorMatchers}
              errorLine={errorLine}
              prevErrorLine={errorLines[idx - 1]}
              isSelected={selectedLineIds.has(errorLine.id)}
              isEditable={editableLineIds.has(errorLine.id)}
              canClassify={canClassify}
            />)
            {/* onChange={() => onUpdateLine({lineId, type, classifiedFailureId, bugNumber})}  */}
            {/* on-editable-change={() => onLineEditableChange({lineId: lineId, editable: editable})} */}
            {/* on-status-change={() => this.lineStatuses.set(errorLine.id, status)} */}
          </li>))}
        </ul>}
      </span>
    );
  }

}

AutoclassifyErrors.propTypes = {
  job: PropTypes.object,
  loadStatus: PropTypes.string,
  errorMatchers: PropTypes.array,
  errorLines: PropTypes.array,
  selectedLineIds: PropTypes.object,
  editableLineIds: PropTypes.object,
  canClassify: PropTypes.bool,
  // onUpdateLine: PropTypes.func,
  // onLineEditableChange: PropTypes.func,
  onToggleSelect: PropTypes.func,
};
