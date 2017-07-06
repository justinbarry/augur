import { connect } from 'react-redux';
import TopicsView from 'modules/topics/components/topics-view';

import { selectLoginAccount } from 'modules/auth/selectors/login-account';
import { selectCreateMarketLink } from 'modules/link/selectors/links';
import { selectTopics } from 'modules/topics/selectors/topics';

const mapStateToProps = state => ({
  branch: state.branch,
  topics: selectTopics(state),
  loginAccount: selectLoginAccount(state)
});

const mapDispatchToProps = dispatch => ({
  createMarketLink: selectCreateMarketLink(dispatch)
});

const Topics = connect(mapStateToProps, mapDispatchToProps)(TopicsView);

export default Topics;
