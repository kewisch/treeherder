import PropTypes from 'prop-types';

import ErrorLineData from './autoclassify/ErrorLineModel';
import AutoclassifyToolbar from './autoclassify/AutoclassifyToolbar';
import ErrorLine from './autoclassify/ErrorLine';
import { getLogViewerUrl, getApiUrl, getProjectJobUrl } from "../helpers/urlHelper";
import treeherder from "../js/treeherder";

class AutoclassifyTab extends React.Component {
  constructor(props) {
    super(props);

    const { $injector } = this.props;

    this.$rootScope = $injector.get('$rootScope');
    this.thEvents = $injector.get('thEvents');
    this.thJobNavSelectors = $injector.get('thJobNavSelectors');
    this.thNotify = $injector.get('thNotify');
    this.ThTextLogErrorsModel = $injector.get('ThTextLogErrorsModel');
    this.ThMatcherModel = $injector.get('ThMatcherModel');

    this.state = {
      loadStatus: "loading",
      errorLines: [],
      // Map between TextLogError id and data.
      // linesById: new Map(),
      // selectedLineIds: new Set(),
      // editableLineIds: new Set(),
      // Map between line id and state selected in the UI
      // stateByLine: new Map(),
      // Autoclassify status when the panel last loaded
      selectableLines: {},
      selectedLines: {},
      autoclassifyStatusOnLoad: null,
    };
    // modified lines waiting to be saved
    // Not reflected in render, so don't belong in state
    this.pendingLines = {};

    // this.requestPromise = null;
  }

  componentWillMount() {
    this.$rootScope.$on(
      this.thEvents.autoclassifyChangeSelection,
      (ev, direction, clear) => this.onChangeSelection(direction, clear));

    this.$rootScope.$on(
      this.thEvents.autoclassifySaveAll,
      () => {
        if (this.canSave(this.pendingLines())) {
          this.onSaveAll();
        } else {
          const msg = (this.canClassify ? "lines not classified" : "Not logged in");
          this.thNotify.send(`Can't save: ${msg}`, "danger");
        }
      });

    this.$rootScope.$on(
      this.thEvents.autoclassifySave,
      () => {
        if (this.canSave(this.selectedLines())) {
          this.onSave();
        } else {
          const msg = (this.canClassify ? "selected lines not classified" : "Not logged in");
          this.thNotify.send(`Can't save: ${msg}`, "danger");
        }
      }
    );

    this.$rootScope.$on(
      this.thEvents.autoclassifyToggleEdit,
      () => this.onToggleEditable());

    this.$rootScope.$on(
      this.thEvents.autoclassifyOpenLogViewer,
      () => this.onOpenLogViewer());
  }

  componentDidMount() {
    // TODO: Once we're not using ng-react any longer and
    // are hosted completely in React, then try moving this
    // .bind to the constructor.
    this.toggleSelect = this.toggleSelect.bind(this);
    this.jobChanged = this.jobChanged.bind(this);

    // Load the data here
    if (this.props.job.id) {
      this.fetchErrorData();
    // } else {
    //   this.jobChanged();
    }


  }

  // shouldComponentUpdate(nextProps) {
  //   const should = nextProps.job !== this.props.job ||
  //          nextProps.job.id !== this.props.job.id;
  //   console.log("should I?", should, this.props.job.id, nextProps.job.id);
  //   return should;
  // }

  componentDidUpdate(prevProps) {
    // Load the data here
    // console.log("did update job", this.props.job.id);
    if (this.props.job.id !== prevProps.job.id) {
      this.fetchErrorData();
    // } else if (this.state.loadStatus !== 'loading') {
    //   this.jobChanged();
    }
  }

  /**
   * Save all pending lines
   */
  onSaveAll() {
    this.save(this.pendingLines())
      .then(() => {
        this.signalFullyClassified();
      });
    this.selectedLineIds.clear();
  }

  /**
   * Save all selected lines
   */
  onSave() {
    this.save(this.selectedLines())
      .then(() => {
        if (this.pendingLines().length === 0) {
          this.signalFullyClassified();
        }
      });
  }

  /**
   * Ignore selected lines
   */
  onIgnore() {
    this.$rootScope.$emit(this.thEvents.autoclassifyIgnore);
  }

  /**
   * Pin selected job to the pinboard
   */
  onPin() {
    //TODO: consider whether this should add bugs or mark all lines as ignored
    this.thPinboard.pinJob(this.job);
  }

  /**
   * Toggle the selection of lines
   * @param {number[]} lineIds - ids of the lines to toggle
   * @param {boolean} clear - Clear the current selection before selecting new elements
   */
  // onToggleSelect(lineIds, clear) {
  //   const isSelected = lineIds
  //     .reduce((map, lineId) => map.set(lineId, this.selectedLineIds.has(lineId)),
  //             new Map());
  //   if (clear) {
  //     this.selectedLineIds.clear();
  //   }
  //   lineIds.forEach((lineId) => {
  //     const line = this.state.linesById.get(lineId);
  //     if (isSelected.get(lineId)) {
  //       this.selectedLineIds.delete(lineId);
  //     } else if (!line.verified) {
  //       this.selectedLineIds.add(lineId);
  //     }
  //   });
  // }

  onToggleEditable() {
    const selectedIds = Array.from(this.selectedLineIds);
    const editable = selectedIds.some(id => !this.state.editableLineIds.has(id));
    this.setEditable(selectedIds, editable);
  }

  onEditableChange(lineId, editable) {
    this.setEditable([lineId], editable);
  }

  onOpenLogViewer() {
    const selected = this.selectedLines();
    const lineNumber = selected.length ? selected[0].data.line_number + 1 : null;

    window.open(getLogViewerUrl(this.job.id, this.$rootScope.repoName, lineNumber));
  }

  /**
   * Pre-determined selection changes, typically for use in response to
   * key events.
   * @param {string} direction - 'next': select the row after the last selected row or
   *                                     the next job if this is the last row (and clear
   *                                     is false)
   *                             'previous': select the row before the first selected row
   *                                         or move to the previous job if the first row
   *                                         is selected and clear is false.
   *                             'all_next': Select all rows in the current job after the
   *                                         current selected row.
   * @param {boolean} clear - Clear the current selection before selecting new elements
   */
  onChangeSelection(direction, clear) {
    const selectable = this.state.selectableLines;

    const optionIndexes = selectable
      .reduce((idxs, x, i) => idxs.set(x.id, i), new Map());
    const selectableIndexes = Array.from(optionIndexes.values());

    const minIndex = selectable.length ?
      selectableIndexes
        .reduce((min, idx) => (idx < min ? idx : min), this.state.errorLines.length) :
      null;

    const selected = this.selectedLines();
    let indexes = [];
    if (direction === "next") {
      if (selected.length) {
        const next = selectableIndexes
          .find(x => x > optionIndexes.get(selected[selected.length - 1].id));
        indexes.push(next !== undefined ? next : "nextJob");
      } else {
        indexes.push(minIndex !== null ? minIndex : "nextJob");
      }
    } else if (direction === "previous") {
      if (selected.length) {
        const prev = [].concat(selectableIndexes).reverse()
          .find(x => x < optionIndexes.get(selected[0].id));
        indexes.push(prev !== undefined ? prev : "prevJob");
      } else {
        indexes.push("prevJob");
      }
    } else if (direction === "all_next" && selected.length && selectable.length) {
      indexes = selectableIndexes
        .filter(x => x > optionIndexes.get(selected[selected.length - 1].id));
    }

    if (clear) {
      // Move to the next or previous panels if we moved out of bounds
      if (indexes.some(x => x === "nextJob")) {
        this.$rootScope.$emit(this.thEvents.changeSelection,
                         'next',
                         this.thJobNavSelectors.UNCLASSIFIED_FAILURES);
        return;
      } else if (indexes.some(x => x === "prevJob")) {
        this.$rootScope.$emit(this.thEvents.changeSelection,
                         'previous',
                         this.thJobNavSelectors.UNCLASSIFIED_FAILURES);
        return;
      }
    } else if (indexes.some(x => x === "prevJob" || x === "nextJob")) {
      return;
    }
    const lineIds = indexes.map(idx => selectable[idx].id);
    this.onToggleSelect(lineIds, clear);
    this.$evalAsync(
      () => $("th-autoclassify-errors th-error-line")[indexes[0]]
        .scrollIntoView({
                          behavior: "smooth",
                          block: "start"
                        }));
  }

  getLoadStatusText() {
    switch (this.state.loadStatus) {
      case 'job_pending': return 'Job not complete, please wait';
      case 'pending': return 'Logs not fully parsed, please wait';
      case 'failed': return 'Log parsing failed';
      case 'no_logs': return 'No errors logged';
      case 'error': return 'Error showing autoclassification data';
      case 'loading': return null;
      case 'ready': return (!this.state.errorLines || this.state.errorLines.length === 0) ? 'No error lines reported' : null;
      default: return `Unexpected status: ${this.state.loadStatus}`;
    }
  }

  setEditable(lineIds, editable) {
    const f = editable ? lineId => this.editableLineIds.add(lineId) :
      lineId => this.editableLineIds.delete(lineId);
    lineIds.forEach(f);
  }

  /**
   * Emit an event indicating that the job has been fully classified
   */
  signalFullyClassified() {
    const jobs = {};
    jobs[this.job.id] = this.job;
    // Emit this event to get the main UI to update
    this.$rootScope.$emit(this.thEvents.autoclassifyVerified, { jobs: jobs });
  }

  /**
   * Convert the HTTP response data for TextLogErrors into the form
   * used internally, and set the initial control status
   * @param {Object[]} lines - Array of TextLogError objects representing log lines
   */
  // loadData(lines) {
  //   this.setState({
  //     linesById: lines.reduce((byId, line) => {
  //       byId.set(line.id, new ErrorLineData(line));
  //       return byId;
  //     }, this.state.linesById)
  //   });
  //   this.errorLines = Array.from(this.state.linesById.values());
  //   // Resort the lines to allow for in-place updates
  //   this.errorLines.sort((a, b) => a.data.id - b.data.id);
  // }

  /**
   * Get TextLogerror data from the API
   */
  async fetchErrorData() {
    const { job } = this.props;

    if (job.id) {
      const matcherResp = await fetch(getApiUrl("/matcher/"));
      const matcherData = await matcherResp.json();
      const matchers = matcherData.reduce(
        (matchersById, matcher) => matchersById.set(matcher.id, matcher), new Map());

      const errorLineResp = await fetch(getProjectJobUrl('/text_log_errors/', job.id));
      const errorLineData = await errorLineResp.json();
      // console.log("errorLineData: ", errorLineData);
      const errorLines = errorLineData.map(line => new ErrorLineData(line))
        .sort((a, b) => a.data.id - b.data.id);

      // console.log("fetchErrorData setState", this.props.job.id, errorLines);
      // Lines that are selected
      // selectedLines = this.lineFilterFunc(line => this.selectedLineIds.has(line.id)),
      const firstLine = errorLines[0];
      const selectedLines = { [firstLine.id]: firstLine };
      const selectableLines = errorLines.reduce((pending, line) => (
        !line.verified ? { ...pending, [line.id]: line } : pending
      ), {});

      this.setState({
        errorLines,
        matchers,
        selectedLines,
        selectableLines,
        loadStatus: 'ready'
      });
      // console.log("setState done", this.props.job.id);
    // } else {
    //   console.log("job was empty");
    }


    // if there's a ongoing request, abort it
    // if (this.requestPromise !== null) {
    //   this.requestPromise.resolve();
    // }

    // this.requestPromise = $q.defer();
    //
    // return $q.all({
    //   matchers: this.ThMatcherModel.by_id(),
    //   error_lines: this.ThTextLogErrorsModel.getList(this.job.id, { timeout: this.requestPromise })
    // });
  }


  /**
   * Test if it is possible to save a specific line.
   * @param {number} lineId - Line id to test.
   */
  canSave(lineId) {
    if (!this.canClassify) {
      return false;
    }
    const state = this.stateByLine.get(lineId);
    if (!state) {
      //This can happen when we are switching jobs
      return false;
    }
    if (state.type === null) {
      return false;
    }
    if (state.type === "ignore") {
      return true;
    }
    return !!(state.classifiedFailureId || state.bugNumber);
  }

  /**
   * Test if it is possible to save all in a list of lines.
   * @param {number[]} lineIds - Line ids to test.
   */
  canSaveAll(lines) {
    return (this.canClassify && lines.length &&
      lines.every(line => this.canSave(line.id)));
  }

  /**
   * Update and mark verified the classification of a list of lines on
   * the server.
   * @param {number[]} lines - Lines to test.
   */
  save(lines) {
    const data = lines.map((line) => {
      const state = this.stateByLine.get(line.id);
      const bestClassification = state.classifiedFailureId || null;
      const bugNumber = state.bugNumber;
      return {
        id: line.id,
        best_classification: bestClassification,
        bug_number: bugNumber
      };
    });
    this.setState({ loadStatus: "loading" });
    return this.ThTextLogErrorsModel
      .verifyMany(data)
      .then((resp) => {
        this.loadData(resp.data);
        this.setState({ loadStatus: "ready" });
      })
      .catch((err) => {
        const prefix = "Error saving classifications:\n ";
        const msg = err.stack ? `${prefix}${err}${err.stack}` : `${prefix}${err.statusText} - ${err.data.detail}`;
        this.thNotify.send(msg, "danger");
      });
  }

  lineFilterFunc(filterFunc) {
    return () => {
      if (!this.state.errorLines) {
        return [];
      }
      return this.state.errorLines.filter(filterFunc);
    };
  }

  /**
   * Build panel contents with HTTP response data
   * @param {Object} data - HTTP response data
   */
  // buildLines(data) {
  //   this.errorMatchers = data.matchers;
  //   this.loadData(data.error_lines);
  //   this.errorLines
  //     .forEach(line => this.stateByLine.set(
  //       line.id, {
  //         classifiedFailureId: null,
  //         bugNumber: null,
  //         type: null
  //       }));
  //   this.requestPromise = null;
  //   // Store the autoclassify status so that we only retry
  //   // the load when moving from 'cross_referenced' to 'autoclassified'
  //   // this.setState({ autoclassifyStatusOnLoad: this.autoclassifyStatus });
  //   // Preselect the first line
  //   const selectable = this.state.selectableLines;
  //   if (selectable.length) {
  //     this.setState({ selectedLineIds: new Set([...Array.from(this.state.selectedLineIds), selectable[0].id]) });
  //     // Run this after the DOM has rendered
  //     this.$evalAsync(
  //       () => {
  //         const elem = $(".autoclassify-errors .error-line")[0];
  //         if (elem) {
  //           elem.scrollIntoView({ behavior: "smooth", block: "start" });
  //         }
  //       });
  //   }
  //   this.$evalAsync(() => {
  //     this.setState({ loadStatus: "ready" });
  //   });
  // }

  /**
   * Update the panel for a new job selection
   */
  jobChanged() {
    const { autoclassifyStatus, hasLogs, logsParsed, logParseStatus, job } = this.props;
    const { loadStatus, autoclassifyStatusOnLoad } = this.state;

    let newLoadStatus = 'loading';
    if (job.state === "pending" || job.state === "running") {
      newLoadStatus = "job_pending";
    } else if (!logsParsed || autoclassifyStatus === "pending") {
      newLoadStatus = "pending";
    } else if (logParseStatus === 'failed') {
      newLoadStatus = "failed";
    } else if (!hasLogs) {
      newLoadStatus = "no_logs";
    } else if (autoclassifyStatusOnLoad === null || autoclassifyStatusOnLoad === "cross_referenced") {
      if (loadStatus !== "ready") {
        newLoadStatus = "loading";
      }
      this.fetchErrorData()
        .then(data => this.buildLines(data))
        .catch(() => {
          this.setState({ loadStatus: "error" });
        });
    }

    this.setState({
      loadStatus: newLoadStatus,
      // linesById: new Map(),
      selectedLines: {},
      selectableLines: {},
      stateByLine: new Map(),
      autoclassifyStatusOnLoad: null,
    });
  }

  // $onChanges(changes) {
  //   const changed = x => changes.hasOwnProperty(x);
  //
  //   if (changed("job")) {
  //     if (this.job.id) {
  //       this.jobChanged();
  //     }
  //   } else if (changed("hasLogs") || changed("logsParsed") ||
  //     changed("logParseStatus") || changed("autoclassifyStatus")) {
  //     this.build();
  //   }
  // }
  //
  /**
   * Toggle the selection of a ErrorLine, if the click didn't happen on an interactive
   * element child of that line.
   */
  toggleSelect(event, errorLine) {
    const elem = $(event.target);
    const interactive = new Set(["INPUT", "BUTTON", "TEXTAREA", "A"]);

    if (interactive.has(elem.prop("tagName"))) {
      return;
    }

    const { selectedLines } = this.state;
    const newId = `${errorLine.id}`;
    let newSelectedLines = { [newId]: errorLine };

    if (event.ctrlKey || event.metaKey) {
      if (newId in selectedLines) {
        // remove it from selection
        newSelectedLines = { ...selectedLines };
        delete newSelectedLines[newId];
      } else {
        // add it to selection
        newSelectedLines = { ...selectedLines, [newId]: errorLine };
      }
    }
    this.setState({ selectedLines: newSelectedLines });
  }

  render() {
    const { job, autoclassifyStatus, user, $injector } = this.props;
    const { errorLines, loadStatus, selectedLines } = this.state;
    const loadStatusText = this.getLoadStatusText();
    const canClassify = this.user ? this.user.loggedin && this.user.is_staff : false;
    // const pendingLines = errorLines.reduce((pending, line) => (
    //   line.verified === false ? { ...pending, [line.id]: line } : pending
    // ), {});
    return (
      <span className="autoclassify-tab">
        <span className="hidden" />
        {canClassify && <AutoclassifyToolbar
          className="th-context-navbar"
          loadStatus={loadStatus}
          autoclassifyStatus={autoclassifyStatus}
          user={user}
          hasSelection={!!Object.keys(selectedLines).length}
          canSave={this.canSave}
          canSaveAll={this.canSaveAll}
          canClassify={canClassify}
          onPin={this.onPin}
          onIgnore={this.onIgnore}
          onEdit={this.onToggleEditable}
          onSave={this.onSave}
          onSaveAll={this.onSaveAll}
        />}

        <div>
          {loadStatusText && <span>{loadStatusText}</span>}
          {loadStatus === 'loading' && <div className="overlay">
            <span className="fa fa-spinner fa-pulse th-spinner-lg" />
          </div>}
        </div>

        <span className="autoclassify-errors">
          <ul className="list-unstyled">
            {errorLines.map((errorLine, idx) => (<li key={errorLine.id}>
              {console.log("selected", `${errorLine.id}` in selectedLines)}
              <ErrorLine
                job={job}
                errorMatchers={this.errorMatchers}
                errorLine={errorLine}
                prevErrorLine={errorLines[idx - 1]}
                canClassify={canClassify}
                $injector={$injector}
                isSelected={`${errorLine.id}` in selectedLines}
                setSelected={this.setSelected}
                toggleSelect={this.toggleSelect}
              />
              {/* title={this.lineStatuses.has(errorLine.id) ? this.titles[this.lineStatuses.get(errorLine.id)] : ''} */}
              {/* onChange={() => onUpdateLine({lineId, type, classifiedFailureId, bugNumber})}  */}
              {/* on-editable-change={() => onLineEditableChange({lineId: lineId, editable: editable})} */}
              {/* on-status-change={() => this.lineStatuses.set(errorLine.id, status)} */}
            </li>))}
          </ul>
        </span>

        {/*!!errorLines.length && <AutoclassifyErrors
          className={loadStatus !== 'ready' ? 'hidden' : ''}
          loadStatus={loadStatus}
          errorMatchers={this.errorMatchers}
          job={job}
          errorLines={this.errorLines}
          selectedLineIds={selectedLineIds}
          editableLineIds={this.editableLineIds}
          canClassify={canClassify}
          onUpdateLine={this.onUpdateLine}
          onLineEditableChange={this.onEditableChange}
          onToggleSelect={this.onToggleSelect}
        />*/}
      </span>
    );
  }
}

AutoclassifyTab.propTypes = {
  job: PropTypes.object,
  logsParsed: PropTypes.bool,
  hasLogs: PropTypes.bool,
  logParseStatus: PropTypes.string,
  autoclassifyStatus: PropTypes.string,
  user: PropTypes.object,
};

treeherder.directive('autoclassifyTab', ['reactDirective', '$injector', (reactDirective, $injector) =>
  reactDirective(AutoclassifyTab, undefined, {}, { $injector })]);
