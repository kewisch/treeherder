import PropTypes from 'prop-types';

import ClassificationOption from './ClassificationOption';
import ClassificationOptionModel from './ClassificationOptionModel';
import StaticClassificationOption from './StaticClassificationOption';
import { getBugUrl, getLogViewerUrl } from "../../helpers/urlHelper";
// import { escapeHTML } from "../../helpers/displayHelper";
import { stringOverlap, highlightLogLine } from "./autoclassifyHelper";

const GOOD_MATCH_SCORE = 0.75;
const BAD_MATCH_SCORE = 0.25;

export default class ErrorLine extends React.Component {

  constructor(props) {
    super(props);

    const { $injector } = this.props;

    this.$rootScope = $injector.get('$rootScope');
    this.thEvents = $injector.get('thEvents');

    this.state = {
      messageExpanded: false,
      showHidden: false,
      selectedOption: null,
    };

    // Map between option id and option data
    this.optionsById = null;
    // initial best option
    this.bestOption = null;


    this.getBugUrl = getBugUrl;

    // Show options that are marked as hidden
    this.showHidden = false;


  }

  componentWillMount() {
    this.$rootScope.$on(this.thEvents.autoclassifySelectOption,
                   (ev, key) => this.onEventSelectOption(key));

    this.$rootScope.$on(this.thEvents.autoclassifyIgnore,
                   () => this.onEventIgnore());

    this.$rootScope.$on(this.thEvents.autoclassifyToggleExpandOptions,
                   () => this.onEventToggleExpandOptions());
  }

  // $onChanges = (changes) => {
  //   const changed = x => changes.hasOwnProperty(x);
  //   if (changed("errorMatchers") || changed("errorLine")) {
  //     build();
  //   }
  //   $scope.verified = this.props.errorLine.data.metadata.best_is_verified;
  //   $scope.failureLine = this.props.errorLine.data.metadata.failure_line;
  //   $scope.searchLine = this.props.errorLine.data.bug_suggestions.search;
  // };

  /**
   * Select the ignore option, and toggle the ignoreAlways setting if it's
   * already selected
   */
  onEventIgnore() {
    if (!this.props.isSelected) {
      return;
    }
    const { errorLine } = this.props;
    const id = errorLine.id + "-ignore";
    if (id !== this.state.selectedOption.id) {
      this.state.selectedOption.id = id;
    } else {
      this.state.selectedOption.ignoreAlways = !this.state.selectedOption.ignoreAlways;
    }
    this.optionChanged();
  }

  /**
   * Select a specified options
   * @param {string} option - numeric id of the option to select or '=' to select the
   manual option
   */
  onEventSelectOption(option) {
    const { isSelected, isEditable } = this.props;
    if (!isSelected || !isEditable) {
      return;
    }
    const { errorLine } = this.props;

    let id;
    if (option === "manual") {
      id = errorLine.id + "-manual";
    } else {
      const idx = parseInt(option);
      const selectableOptions = this.options.filter(option => option.selectable);
      if (selectableOptions[idx]) {
        id = selectableOptions[idx].id;
      }
    }
    if (!this.optionsById.has(id)) {
      return;
    }
    if (id !== this.state.selectedOption.id) {
      this.state.selectedOption.id = id;
      this.optionChanged();
    }
    if (option === "=") {
      $("#" + this.props.errorLine.id + "-manual-bug").focus();
    }
  }

  /**
   * Expand or collapse hidden options
   */
  onEventToggleExpandOptions() {
    if (!this.isSelected || !this.isEditable) {
      return;
    }
    this.setState({ showHidden: !this.state.showHidden });
  }

  getStatus() {
    const currentOption = this.getCurrentOption();
    if (!currentOption) {
      return;
    }

    if (!this.canClassify) {
      return 'classification-disabled';
    } else if (this.props.errorLine.verified) {
      return 'verified';
    } else if (currentOption.type === 'ignore') {
      return 'unverified-ignore';
    } else if (currentOption.type === "manual" &&
      !this.state.selectedOption.manualBugNumber) {
      return 'unverified-no-bug';
    }
    return 'unverified';
  }

  /**
   * Build a list of options applicable to the current line.
   */
  getOptions() {
    const bugSuggestions = [].concat(
      this.props.errorLine.data.bug_suggestions.bugs.open_recent,
      this.props.errorLine.data.bug_suggestions.bugs.all_others);

    const classificationMatches = this.getClassifiedFailureMatcher();

    const autoclassifyOptions = this.props.errorLine.data.classified_failures
      .filter(cf => cf.bug_number !== 0)
      .map(cf => new ClassificationOptionModel("classifiedFailure",
        this.props.errorLine.id + "-" + cf.id,
                                            cf.id,
                                            cf.bug_number,
                                            cf.bug ? cf.bug.summary : "",
                                            cf.bug ? cf.bug.resolution : "",
                                            classificationMatches(cf.id)));
    const autoclassifiedBugs = autoclassifyOptions
      .reduce((classifiedBugs, option) => classifiedBugs.add(option.bugNumber),
              new Set());

    const bugSuggestionOptions = bugSuggestions
      .filter(bug => !autoclassifiedBugs.has(bug.id))
      .map(bugSuggestion => new ClassificationOptionModel(
        "unstructuredBug",
        this.props.errorLine.id + "-ub-" + bugSuggestion.id,
        null,
        bugSuggestion.id,
        bugSuggestion.summary,
        bugSuggestion.resolution));

    this.bestOption = null;

    // Look for an option that has been marked as the best classification.
    // This is always sorted first and never hidden, so we remove it and readd it.
    if (!this.bestIsIgnore()) {
      const bestIndex = this.props.errorLine.bestClassification ?
        autoclassifyOptions
          .findIndex(option => option.classifiedFailureId === this.props.errorLine.bestClassification.id) : -1;

      if (bestIndex > -1) {
        this.bestOption = autoclassifyOptions[bestIndex];
        this.bestOption.isBest = true;
        autoclassifyOptions.splice(bestIndex, 1);
        this.scoreOptions([this.bestOption]);
      }
    }

    const options = autoclassifyOptions.concat(bugSuggestionOptions);
    this.scoreOptions(options);
    this.sortOptions(options);

    if (this.bestOption) {
      options.unshift(this.bestOption);
    }

    this.markHidden(options);

    return options;
  }

  /**
   * Build a list of the default options that apply to all lines.
   */
  getExtraOptions() {
    const extraOptions = [new ClassificationOptionModel("manual", this.props.errorLine.id + "-manual")];
    const ignoreOption = new ClassificationOptionModel("ignore", this.props.errorLine.id + "-ignore", 0);
    extraOptions.push(ignoreOption);
    if (this.bestIsIgnore()) {
      ignoreOption.isBest = true;
    }
    return extraOptions;
  }

  /**
   * Currently selected option data
   */
  getCurrentOption() {
    if (!this.optionsById) {
      return null;
    }
    return this.optionsById.get(this.state.selectedOption.id);
  }

  /**
   * Get the initial default option
   * @param {Object[]} options - List of line-specific options
   * @param {Object[]} extraOptions - List of line-independent options
   * @param {Object[]} prevLine - Line before the current one in the log
   */
  getDefaultOption(options, extraOptions, prevLine) {
    // If we have a best option from the autoclassifier use that
    if (options.length && options[0].isBest && options[0].selectable) {
      return options[0];
    }

    const { errorLine } = this.props;
    // Otherwise we need to decide whether to use a bug suggestion
    // or to ignore the line
    const failureLine = errorLine.data.failure_line;

    function parseTest(line) {
      const parts = line.split(" | ", 3);
      return parts.length === 3 ? parts[1] : null;
    }

    // Search for the best selectable bug suggestion, using the fact that
    // these are already sorted by string overlap
    this.bestOption = options.find(option => option.selectable);

    // If that suggestion is good enough just use it
    if (this.bestOption && this.bestOption.score >= GOOD_MATCH_SCORE) {
      return this.bestOption;
    }

    /* If there was no autoclassification and no good
     * suggestions, we need to guess whether this is an
     * ignorable line or one which must be classified. The
     * general approach is to assume a pure log line
     * without any keywords that indicate importance is
     * ignorable, as is a test line from the same test as
     * the previous line. Otherwise we assume that the
     * line pertains to a new bug
     */

    // Get the test id for this line and the last line, if any
    const thisTest = failureLine ? failureLine.test :
      parseTest(errorLine.data.bug_suggestions.search);
    const prevTest = prevLine ? (prevLine.data.failure_line ?
      prevLine.data.failure_line.test :
      parseTest(prevLine.data.bug_suggestions.search)) :
      null;

    let ignore;

    // Strings indicating lines that should not be ignored
    const importantLines = [
      /\d+ bytes leaked/,
      /application crashed/,
      /TEST-UNEXPECTED-/
    ];

    if (prevTest && thisTest && prevTest === thisTest) {
      // If the previous line was about the same test as
      // this one and this doesn't have any good bug
      // suggestions, we assume that is the signature line
      // and this is ignorable
      ignore = true;
    } else if (failureLine &&
      (failureLine.action === "crash" ||
        failureLine.action === "test_result")) {
      // Don't ignore crashes or test results
      ignore = false;
    } else {
      // Don't ignore lines containing a well-known string
      const message = failureLine ?
        (failureLine.signature ? failureLine.signature :
          failureLine.message) :
        this.props.errorLine.data.bug_suggestions.search;
      ignore = !importantLines.some(x => x.test(message));
    }
    // If we didn't choose to ignore the line and there is a bug suggestion
    // that isn't terrible, use that
    if (!ignore && this.bestOption && this.bestOption.score > BAD_MATCH_SCORE) {
      return this.bestOption;
    }
    //Otherwise select either the ignore option or the manual bug option
    const offset = ignore ? -1 : -2;

    return extraOptions[extraOptions.length + offset];
  }

  /**
   * Update internal line state after it is changed in the UI
   * @param {number} lineId - id of the TextLogError
   * @param {string} type - Type of classification
   * @param {?number} classifiedFailureId - id of classified failure
   * @param {?bugNumber} bugNumber - id of bug
   */
  // TODO: handle in ErrorLine
  onUpdateLine(lineId, type, classifiedFailureId, bugNumber) {
    const state = this.stateByLine.get(lineId);
    state.type = type;
    state.classifiedFailureId = classifiedFailureId;
    state.bugNumber = bugNumber;
  }

  /**
   * Return a function that takes a classified failure id and returns the
   * matcher that provided the best match, and the score of that match.
   */
  getClassifiedFailureMatcher() {
    const matchesByCF = this.props.errorLine.data.matches.reduce(
      function (matchesByCF, match) {
        if (!matchesByCF.has(match.classified_failure)) {
          matchesByCF.set(match.classified_failure, []);
        }
        matchesByCF.get(match.classified_failure).push(match);
        return matchesByCF;
      }, new Map());

    return function (cf_id) {
      return matchesByCF.get(cf_id).map(
        function (match) {
          return {
            matcher: this.props.errorMatchers.get(match.matcher),
            score: match.score
          };
        });
    };
  }

  /**
   * Sort a list of options by score
   * @param {Object[]} options - List of options to sort
   */
  sortOptions(options) {
    // Sort all the possible failure line options by their score
    options.sort((a, b) => b.score - a.score);
  }

  /**
   * Mark some options hidden based on a heuristic to ensure that we initially
   * show only the most likely bug suggestion options to sheriffs.
   * @param {Object[]} options - List of options to potentially hide
   */
  markHidden(options) {
    // Mark some options as hidden by default
    // We do this if the score is too low compared to the best option
    // or if the score is below some threshold or if there are too many
    // options
    if (!options.length) {
      return;
    }

    this.bestOption = options[0];

    const lowerCutoff = 0.1;
    const bestRatio = 0.5;
    const maxOptions = 10;
    const minOptions = 1;

    const bestScore = this.bestOption.score;

    options.forEach((option, idx) => {
      option.hidden = idx > (minOptions - 1) &&
        (option.score < lowerCutoff ||
          option.score < bestRatio * bestScore ||
          idx > (maxOptions - 1));
    });
  }

  /**
   * Give each option in a list a score based on either autoclassifier-provided score
   * or a textual overlap between a bug suggestion and the log data in the error this.props.errorLine.
   * @param {Object[]} options - List of options to score
   */
  scoreOptions(options) {
    options
      .forEach((option) => {
        let score;
        const data = this.props.errorLine.data;
        if (option.type === "classifiedFailure") {
          score = parseFloat(
            data.matches.find(
              x => x.classified_failure === option.classifiedFailureId).score);
        } else {
          score = stringOverlap(data.bug_suggestions.search,
                                option.bugSummary.replace(/^\s*Intermittent\s+/, ""));
          // Artificially reduce the score of resolved bugs
          score *= option.bugResolution ? 0.8 : 1;
        }
        option.score = score;
      });
  }

  /**
   * Test if any options in a list are hidden
   * @param {Object[]} options - List of options
   */
  hasHidden(options) {
    return options.some(option => option.hidden);
  }

  /**
   * Test if the initial best option is to ignore the line
   */
  bestIsIgnore() {
    const { errorLine: { data: errorData } } = this.props;
    if (errorData.metaData) {
      return (errorData.metadata.best_classification &&
        errorData.metadata.best_classification.bugNumber === 0);
    }
    return false;
  }

  // editableChanged(editable) {
    // this.props.onEditableChange({
    //   lineId: this.props.errorLine.id,
    //   editable: editable
    // });
  // }

  /**
   * Update data about the currently selected option in response to
   * a selection in the UI
   */
  optionChanged() {
    // const option = this.getCurrentOption();
    // this.currentOption = option;
    // // If the best option is a classified failure with no associated bug number
    // // then default to updating that option with a new bug number
    // // TODO: consider adding the update/create options back here, although it's
    // // not clear anyone ever understood how they were supposed to work
    // const classifiedFailureId = ((this.bestOption &&
    //   this.bestOption.classifiedFailureId &&
    //   this.bestOption.bugNumber === null) ?
    //   this.bestOption.classifiedFailureId :
    //   option.classifiedFailureId);
    // const bug = (option.type === "manual" ?
    //   this.state.selectedOption.manualBugNumber :
    //   (option.type === "ignore" ?
    //     (this.state.selectedOption.ignoreAlways ? 0 : null) :
    //     option.bugNumber));
    // const data = {
    //   lineId: this.props.errorLine.id,
    //   type: option.type,
    //   classifiedFailureId: classifiedFailureId,
    //   bugNumber: bug
    // };
    // this.props.onChange(data);
  }

  /**
   * Determine whether the line should be open for editing by default
   */
  defaultEditable() {
    const option = this.getCurrentOption();
    return !(option.score >= GOOD_MATCH_SCORE || option.type === "ignore");
  }

  render() {
    const { errorLine, job, canClassify, isEditable, isSelected, $injector, toggleSelect } = this.props;
    const { messageExpanded, showHidden } = this.state;
    // console.log("render ErrorLine", errorLine.data);
    const failureLine = errorLine.data.metadata.failure_line;
    const searchLine = errorLine.data.bug_suggestions.search;
    // const verified = errorLine.data.metadata.best_is_verified;
    const logUrl = getLogViewerUrl(job.id, this.$rootScope.repoName, errorLine.data.line_number + 1);

    let options = [];
    let extraOptions = [];
    let allOptions = [];

    if (!errorLine.verified) {
      options = this.getOptions();
      extraOptions = this.getExtraOptions(options);
      allOptions = options.concat(extraOptions);

      this.optionsById = allOptions.reduce((byId, option) => {
        byId.set(option.id, option);
        return byId;
      }, new Map());

      const defaultOption = this.getDefaultOption(
        options,
        extraOptions,
        this.props.prevErrorLine);

      this.state.selectedOption = {
        id: defaultOption.id,
        manualBugNumber: "",
        ignoreAlways: false
      };
      // this.editableChanged(this.defaultEditable());
      this.optionChanged();
    } else {
      this.state.selectedOption = {
        id: null,
        manualBugNumber: "",
        ignoreAlways: false
      };
    }
    const status = this.getStatus();

    return (
      <div
        className={`error-line ${isSelected ? 'selected' : ''}`}
        onClick={evt => toggleSelect(evt, errorLine)}
      >
        <div className={status}>&nbsp;</div>
        {errorLine.verified && <div>
          {!errorLine.verifiedIgnore && <span
            className="badge badge-xs badge-primary"
            title="This line is verified"
          >Verified</span>}
          {errorLine.verifiedIgnore && <span
            className="badge badge-xs badge-ignored"
            title="This line is ignored"
          >Ignored</span>}
        </div>}

        <div className="classification-line-detail">
          {failureLine && <div>
            {failureLine.action === 'test_result' && <span>
              <span className={errorLine.verifiedIgnore ? 'ignored-line' : ''}>
                <strong className="failure-line-status">{failureLine.status}</strong>
                {failureLine.expected !== 'PASS' && failureLine.expected !== 'OK' && <span>
                  (expected <strong>{failureLine.expected}</strong>)
                </span>} | <strong>{failureLine.test}</strong>
                {failureLine.subtest && <span>| {failureLine.subtest}</span>}
              </span>
              {failureLine.message && !errorLine.verifiedIgnore &&
                <div className="failure-line-message">
                  <span
                    className={`failure-line-message-toggle fa fa-fw fa-lg${messageExpanded ? 'fa-caret-down' : 'fa-carat-right'}`}
                    onClick={() => this.setState({ messageExpanded: !messageExpanded })}
                  />
                  {messageExpanded ?
                    <span className="failure-line-message-expanded">{failureLine.message}</span> :
                    <span className="failure-line-message-collapsed">{failureLine.message}</span>}
                </div>}
            </span>}
            {failureLine.action === 'log' && <span>
                  LOG {failureLine.level} | {failureLine.message}
            </span>}
            {failureLine.action === 'crash' && <span>
                  CRASH |
              {failureLine.test && <span><strong>{failureLine.test}</strong> |
              </span>}
                  application crashed [{failureLine.signature}]
              </span>}
            <span> [<a
              title="Open the log viewer in a new window"
              target="_blank"
              rel="noopener"
              href={logUrl}
              className=""
            >log…</a>]</span>
          </div>}
          {!failureLine && <div>
            {highlightLogLine(searchLine)}
            <span> [<a
              title="Open the log viewer in a new window"
              target="_blank"
              rel="noopener"
              href={logUrl}
            >log…</a>]</span>
          </div>}

          {errorLine.verified && !errorLine.verifiedIgnore && <div>
            <span className="fa fa-star best-classification-star" />
            {errorLine.bugNumber && <span className="line-option-text">
              <a
                href={getBugUrl(errorLine.bugNumber)}
                target="_blank"
                rel="noopener"
              >Bug {errorLine.bugNumber} - {errorLine.bugSummary && <span>{errorLine.bugSummary}</span>}</a>
              {!errorLine.bugNumber && <span className="line-option-text">
                Classifed failure with no bug number
              </span>}
            </span>}
          </div>}

          {((!errorLine.verified && isEditable) || !canClassify) && <div>
            <ul className="list-unstyled">
              {options.map(option => (
                (showHidden || !option.hidden) && <li key={option.id}>
                  <ClassificationOption
                    job={job}
                    errorLine={errorLine}
                    optionModel={option}
                    selectedOption={this.state.selectedOption}
                    canClassify={canClassify}
                    onChange={this.optionChanged}
                    $injector={$injector}
                  />
                </li>))}
            </ul>

            {/* Using a list here is totally a hack */}
            <ul className="list-unstyled">
              <li>
                {this.hasHidden(options) &&
                  <a
                    onClick={() => this.setState({ showHidden: !this.state.showHidden })}
                    className="link-style"
                  >
                    {/* note we have to use ng-hide rather than ng-if here otherwise the
                        node gets taken out of the dom which interferes with the did-we-click-a-link
                        code */}
                    <span className={showHidden ? 'hidden' : ''}>More…</span>
                    <span className={!showHidden ? 'hidden' : ''}>Fewer</span>
                  </a>}
              </li>
            </ul>
            {canClassify && <ul className="list-unstyled">
              {/* classification options for line */}
              {extraOptions.map(option => (
                <li key={option.id}>
                  <ClassificationOption
                    job={job}
                    errorLine={errorLine}
                    optionModel={option}
                    selectedOption={this.state.selectedOption}
                    canClassify={canClassify}
                    onChange={this.optionChanged}
                    $injector={$injector}
                  />
                </li>))}
            </ul>}
          </div>}

          {!errorLine.verified && !isEditable && canClassify && <div>
            <StaticClassificationOption
              job={job}
              errorLine={errorLine}
              optionData={this.currentOption}
              selectedOption={this.state.selectedOption}
              numOptions={options.length}
              canClassify={this.canClassify}
            />
              {/*onExpandOptions={() => this.editableChanged(true)}*/}
          </div>}
        </div>
      </div>
    );
  }
}

ErrorLine.propTypes = {
  job: PropTypes.object,
  errorMatchers: PropTypes.object,
  errorLine: PropTypes.object,
  prevErrorLine: PropTypes.object,
  isSelected: PropTypes.bool,
  isEditable: PropTypes.bool,
  canClassify: PropTypes.bool,
  // onChange: PropTypes.func,
  // onEditableChange: PropTypes.func,
  $injector: PropTypes.object,
  // onStatusChange: PropTypes.func
};

