import PropTypes from 'prop-types';

import { getBugUrl, /*getLogViewerUrl*/ } from "../../helpers/urlHelper";
import { highlightCommonTerms } from "../../helpers/displayHelper";

/**
 * Editable option component controller
 */
export default class ClassificationOption extends React.Component {
  constructor(props) {
    super(props);
    const { $injector } = props;

    this.thPinboard = $injector.get('thPinboard');
    this.thReftestStatus = $injector.get('thReftestStatus');
    this.$rootScope = $injector.get('$rootScope');


    this.getBugUrl = getBugUrl;
  }

  setManualBugNumber(newValue) {
    const { selectedOption, onChange } = this.props;
    selectedOption.manualBugNumber = newValue();
    onChange();
  }

  fileBug() {
    console.log("fileBug in ClassificationOption");
    // const reftestUrlRoot = "https://hg.mozilla.org/mozilla-central/raw-file/tip/layout/tools/reftest/reftest-analyzer.xhtml#logurl=";
    // const { job, errorLine, selectedOption, optionModel, onChange } = this.props;
    //
    // let logUrl = job.logs.filter(x => x.name.endsWith("_json"));
    // logUrl = logUrl[0] ? logUrl[0].url : job.logs[0];
    //
    // const crashSignatures = [];
    // const crashRegex = /application crashed \[@ (.+)\]$/g;
    //
    // const crash = errorLine.data.bug_suggestions.search.match(crashRegex);
    // if (crash) {
    //   const signature = crash[0].split("application crashed ")[1];
    //   if (!crashSignatures.includes(signature)) {
    //     crashSignatures.push(signature);
    //   }
    // }

    // const modalInstance = $uibModal.open({
    //    template: intermittentTemplate,
    //    controller: 'BugFilerCtrl',
    //    size: 'lg',
    //    openedClass: "filer-open",
    //    resolve: {
    //      summary: () => errorLine.data.bug_suggestions.search,
    //      search_terms: () => errorLine.data.bug_suggestions.search_terms,
    //      fullLog: () => logUrl,
    //      parsedLog: () => location.origin + "/" + getLogViewerUrl(job.id, this.$rootScope.repoName),
    //      reftest: () => (this.thReftestStatus(job) ? reftestUrlRoot + logUrl + "&only_show_unexpected=1" : ""),
    //      selectedJob: () => job,
    //      allFailures: () => [errorLine.data.bug_suggestions.search.split(" | ")],
    //      crashSignatures: () => crashSignatures,
    //      successCallback: () => (data) => {
    //        const bugId = data.success;
    //        selectedOption.manualBugNumber = bugId;
    //        window.open("https://bugzilla.mozilla.org/show_bug.cgi?id=" + bugId);
    //        onChange();
    //      }
    //    }
    //  });
    // selectedOption.id = optionModel.id;
    // modalInstance.opened.then(() => modalInstance.initiate());
  }

  render() {
    const { job, errorLine, optionModel, selectedOption, canClassify, onChange } = this.props;
    const option = optionModel;
    // console.log("option", canClassify, option);
    const bugSummary = { __html: highlightCommonTerms(
      option.bugSummary, errorLine.data.bug_suggestions.search) };

    return (
      <div className="th-classification-option">
        <div className="classification-icon">
          {option.isBest ?
            <span className="fa fa-star-o" title="Autoclassifier best match" /> :
            <span className="classification-no-icon">&nbsp;</span>}
        </div>

        <label>
          {!(option.type === 'classifiedFailure' && !option.bugNumber) && 'a' && <input
            type="radio"
            value={option.id}
            id={option.id}
            name={option.id}
            ng-model={selectedOption}
            onChange={onChange}
            className={canClassify ? '' : 'hidden'}
          />}
          {!!option.bugNumber && <span className="line-option-text">
            {(!canClassify || this.thPinboard.isPinned(job)) &&
              <button
                className="btn btn-xs btn-light-bordered"
                onClick={() => this.thPinboard.addBug({ id: option.bugNumber }, job)}
                title="add to list of bugs to associate with all pinned jobs"
              ><i className="fa fa-thumb-tack" /></button>}
            {!!option.bugResolution &&
              <span className="classification-bug-resolution"> [{option.bugResolution}] </span>}
            <a
              href={getBugUrl(option.bugNumber)}
              target="_blank"
              rel="noopener"
            >{option.bugNumber} -
              <span dangerouslySetInnerHTML={bugSummary} />
            </a>
            <span> [ {Number.parseFloat(option.score).toPrecision(2)} ]</span>
          </span>}

          {option.type === 'classifiedFailure' && !option.bugNumber && <span>
            Autoclassified failure with no associated bug number
          </span>}

          {option.type === 'manual' && 'b' &&
            <span className={`line-option-text ${!canClassify ? 'hidden' : ''}`}>
            Other bug
              <input
                className="manual-bug-input"
                id="{{ ::line.id }}-manual-bug"
                type="text"
                size="7"
                placeholder="Number"
                onChange={this.setManualBugNumber}
                ng-model=""
              />
              <a
                className="btn btn-xs btn-light-bordered"
                onClick={this.fileBug}
                title="File a bug for this failure"
              ><i className="fa fa-bug" /></a>

              {selectedOption.id === 'manual' && !!selectedOption.manualBugNumber &&
              <a
                href={getBugUrl(selectedOption.manualBugNumber)}
                target="_blank"
                rel="noopener"
              >[view]</a>}
            </span>}

          {option.type ==='ignore' && <span
            className={`line-option-text ${canClassify ? '' : 'hidden'}`}
          >Ignore line
            {/*<select
              ng-model="selectedOption.ignoreAlways"
              onChange={onChange}
              ng-options="key for (key,value) in {'Here only': false, 'For future classifications': true}">
            </select>*/}
          </span>}

        </label>


        {option.type === 'classifiedFailure' && <div className="classification-matchers">
          Matched by:
          {option.matches && option.matches.map(match => (<span>
            {match.matcher.name} ({match.score})
          </span>))}
        </div>}
      </div>
    );
  }
}


ClassificationOption.propTypes = {
  job: PropTypes.object,
  errorLine: PropTypes.object,
  optionModel: PropTypes.object,
  canClassify: PropTypes.bool,
  selectedOption: PropTypes.object,
  onChange: PropTypes.func,
  $injector: PropTypes.object,
};
