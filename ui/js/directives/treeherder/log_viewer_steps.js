import treeherder from '../../treeherder';
import lvLogStepsTemplate from '../../../partials/logviewer/lvLogSteps.html';

treeherder.directive('lvLogSteps', ['$timeout', ($timeout) => {
    function getOffsetOfStep(order) {
        const el = $('.lv-step[order="' + order + '"]');
        const parentOffset = el.parent().offset();

        return el.offset().top -
               parentOffset.top + el.parent().scrollTop() -
               parseInt($('.steps-data').first().css('padding-bottom'));
    }

    /* -------------------------------------------------------------------- */

    return {
        restrict: 'A',
        template: lvLogStepsTemplate,
        link: (scope) => {
            scope.toggleSuccessfulSteps = () => {
                scope.showSuccessful = !scope.showSuccessful;

                const firstError = scope.steps.filter(step => step.result && step.result !== 'success')[0];

                if (!firstError) {
                    return;
                }

                // scroll to the first error
                $timeout(() => {
                    const scrollTop = getOffsetOfStep(firstError.order);

                    $('.steps-data').scrollTop(scrollTop);
                });
            };
        }
    };
}]);
