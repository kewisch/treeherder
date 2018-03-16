import PropTypes from 'prop-types';

/**
 * Toolbar controller
 */
export default class AutoclassifyToolbar extends React.Component {

  getButtonTitle(condition, activeTitle, inactiveTitle) {
    const { user }= this.props;

    if (!user || !user.loggedin) {
      return "Must be logged in";
    }
    if (!user.is_staff) {
      return "Insufficeint permissions";
    }
    if (condition) {
      return activeTitle;
    }
    return inactiveTitle;
  }

  render() {
    const {
      hasSelection, canSave, canSaveAll, canClassify, onPin, onIgnore, onSave,
      onSaveAll, onEdit, autoclassifyStatus
    } = this.props;

    return (
      <div className="navbar-right">
        {status === 'ready' && <div>
          {autoclassifyStatus === 'cross_referenced' && <span>Autoclassification pending</span>}
          {autoclassifyStatus === 'failed' && <span>Autoclassification failed</span>}
        </div>}

        <button
          className="btn btn-view-nav btn-sm nav-menu-btn"
          title="Pin job for bustage"
          ng-click={onPin}
          prevent-default-on-left-click
        >Bustage
        </button>

        <button
          className={`btn btn-view-nav btn-sm nav-menu-btn ${hasSelection && canClassify ? 'disabled': ''}`}
          title={this.getButtonTitle(hasSelection, 'Edit selected lines', 'Nothing selected')}
          ng-click={onEdit}
          prevent-default-on-left-click
        >Edit</button>

        <button
          className={`btn btn-view-nav btn-sm nav-menu-btn ${hasSelection && canClassify ? 'disabled': ''}`}
          title={this.getButtonTitle(hasSelection, 'Ignore selected lines', 'Nothing selected')}
          ng-click={onIgnore}
          prevent-default-on-left-click
        >Ignore</button>

        <button
          className={`btn btn-view-nav btn-sm nav-menu-btn ${canSave ? 'disabled': ''}`}
          title={this.getButtonTitle(canSave, 'Save', 'Nothing selected')}
          ng-click={onSave}
          prevent-default-on-left-click
        >Save</button>

        <button
          className={`btn btn-view-nav btn-sm nav-menu-btn ${canSaveAll ? 'disabled': ''}`}
          title={this.getButtonTitle(canSaveAll, 'Save All', 'Lines not classified')}
          ng-click={onSaveAll}
          prevent-default-on-left-click
        >Save All</button>
      </div>
    );
  }
}

AutoclassifyToolbar.propTypes = {
  // loadStatus: PropTypes.string,
  autoclassifyStatus: PropTypes.string,
  user: PropTypes.object,
  canSave: PropTypes.bool,
  canSaveAll: PropTypes.bool,
  canClassify: PropTypes.bool,
  hasSelection: PropTypes.bool,
  onIgnore: PropTypes.func,
  onSave: PropTypes.func,
  onSaveAll: PropTypes.func,
  onEdit: PropTypes.func,
  onPin: PropTypes.func,
};

