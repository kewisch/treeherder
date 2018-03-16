import PropTypes from 'prop-types';
import { getBugUrl } from "../../helpers/urlHelper";
import { highlightCommonTerms } from "../../helpers/displayHelper";

/**
 * Non-editable best option controller
 */
export default class StaticClassificationOptionController extends React.Component {
  constructor(props) {
    super(props);
    const { $injector } = this.props;

    this.thPinboard = $injector.get('thPinboard');

    // $scope.getBugUrl = getBugUrl;
  }

  render() {
    const {
      job, canClassify, errorLine, option, selectedOption, numOptions, onExpandOptions
    } = this.props;
    const bugSummary = { __html: highlightCommonTerms(
      option.bugSummary, errorLine.data.bug_suggestions.search) };
    const optionCount = numOptions - 1;

    return (
      <div>
        <div className="classification-icon">
          {option.isBest ?
            <span className="fa fa-star-o" title="Autoclassifier best match" /> :
            <span className="classification-no-icon">&nbsp;</span>}
        </div>

        {!!option.bugNumber && <span className="line-option-text">
          {!canClassify || this.thPinboard.isPinned(job) &&
            <button
              className="btn btn-xs btn-light-bordered"
              onClick={this.thPinboard.addBug({ id: option.bugNumber }, job)}
              title="add to list of bugs to associate with all pinned jobs"
            ><i className="fa fa-thumb-tack" /></button>}
          {!!option.bugResolution &&
            <span className="classification-bug-resolution">[{option.bugResolution}]</span>}
          <a
            href={getBugUrl(option.bugNumber)}
            target="_blank"
            rel="noopener"
          >{option.bugNumber} -
            <span dangerouslySetInnerHTML={bugSummary} />
          </a>
          <span>[ {Number.parseFloat(option.score).toPrecision(2)} ]</span>
        </span>}

        {option.type === 'classifiedFailure' && !option.bugNumber && <span>
          Autoclassified failure with no associated bug number
        </span>}

        {option.type === 'manual' && <span className="line-option-text">
          Bug
          {!!selectedOption.manualBugNumber && <a
            href={getBugUrl(selectedOption.manualBugNumber)}
            target="_blank"
            rel="noopener"
          >{selectedOption.manualBugNumber}</a>}
          {!!selectedOption.manualBugNumber && <span>No bug number specified</span>}
        </span>}

        {option.type==='ignore' && <span className="line-option-text">Ignore</span>}
        {optionCount > 0 && <span>{optionCount} other {optionCount === 1 ? 'option' : 'options'}

        </span>}
        <div>
          <a onClick={onExpandOptions} className="link-style">Edit…</a>
        </div>
      </div>
    );
  }
}


StaticClassificationOptionController.propTypes = {
  job: PropTypes.object,
  errorLine: PropTypes.object,
  option: PropTypes.object,
  selectedOption: PropTypes.object,
  numOptions: PropTypes.number,
  canClassify: PropTypes.bool,
  onExpandOptions: PropTypes.func,
};

