import Ember from 'ember';
import loadAll from 'ember-osf/utils/load-relationship';
import config from 'ember-get-config';
import Analytics from '../mixins/analytics';
import permissions from 'ember-osf/const/permissions';
import KeenTracker from 'ember-osf/mixins/keen-tracker';

/**
 * Takes an object with query parameter name as the key and value, or [value, maxLength] as the values.
 *
 * @method queryStringify
 * @param queryParams {!object}
 * @param queryParams.key {!array|!string}
 * @param queryParams.key[0] {!string}
 * @param queryParams.key[1] {int}
 * @return {string}
 */
function queryStringify(queryParams) {
    const query = [];

    // TODO set up ember to transpile Object.entries
    for (const param in queryParams) {
        let value = queryParams[param];
        let maxLength = null;

        if (Array.isArray(value)) {
            maxLength = value[1];
            value = value[0];
        }

        if (!value)
            continue;

        value = encodeURIComponent(value);

        if (maxLength)
            value = value.slice(0, maxLength);

        query.push(`${param}=${value}`);
    }

    return query.join('&');
}

/**
 * @module ember-preprints
 * @submodule controllers
 */

/**
 * @class Content Controller
 */
export default Ember.Controller.extend(Analytics, KeenTracker, {
    theme: Ember.inject.service(),
    fullScreenMFR: false,
    currentUser: Ember.inject.service(),
    expandedAuthors: true,
    showLicenseText: false,
    expandedAbstract: false,
    isAdmin: Ember.computed('node', function() {
        // True if the current user has admin permissions for the node that contains the preprint
        return (this.get('node.currentUserPermissions') || []).includes(permissions.ADMIN);
    }),
    twitterHref: Ember.computed('node', function() {
        const queryParams = {
            url: window.location.href,
            text: this.get('node.title'),
            via: 'OSFramework'
        };

        return `https://twitter.com/intent/tweet?${queryStringify(queryParams)}`;
    }),
    /* TODO: Update this with new Facebook Share Dialog, but an App ID is required
     * https://developers.facebook.com/docs/sharing/reference/share-dialog
     */
    facebookHref: Ember.computed('model', function() {
        const queryParams = {
            app_id: config.FB_APP_ID,
            display: 'popup',
            href: window.location.href,
            redirect_uri: window.location.href
        };

        return `https://www.facebook.com/dialog/share?${queryStringify(queryParams)}`;
    }),
    // https://developer.linkedin.com/docs/share-on-linkedin
    linkedinHref: Ember.computed('node', function() {
        const queryParams = {
            url: [window.location.href, 1024],          // required
            mini: ['true', 4],                          // required
            title: [this.get('node.title'), 200],      // optional
            summary: [this.get('node.description'), 256], // optional
            source: ['Open Science Framework', 200]     // optional
        };

        return `https://www.linkedin.com/shareArticle?${queryStringify(queryParams)}`;
    }),
    emailHref: Ember.computed('node', function() {
        const queryParams = {
            subject: this.get('node.title'),
            body: window.location.href
        };

        return `mailto:?${queryStringify(queryParams)}`;
    }),
    // The currently selected file (defaults to primary)
    activeFile: null,

    disciplineReduced: Ember.computed('model.subjects', function() {
        // Preprint disciplines are displayed in collapsed form on content page
        return this.get('model.subjects').reduce((acc, val) => acc.concat(val), []).uniqBy('id');
    }),

    hasTag: Ember.computed('node.tags', function() {
        return (this.get('node.tags') || []).length;
    }),

    getAuthors: Ember.observer('node', function() {
        // Cannot be called until node has loaded!
        const node = this.get('node');
        if (!node) return [];

        const contributors = Ember.A();
        loadAll(node, 'contributors', contributors).then(() =>
            this.set('authors', contributors)
        );
    }),

    doiUrl: Ember.computed('model.doi', function() {
        return `https://dx.doi.org/${this.get('model.doi')}`;
    }),

    fullLicenseText: Ember.computed('model.license', function() {
        let text = this.get('model.license.text');
        if (text) {
            text = text.replace(/({{year}})/g, this.get('model.licenseRecord').year || '');
            text = text.replace(/({{copyrightHolders}})/g, this.get('model.licenseRecord').copyright_holders ? this.get('model.licenseRecord').copyright_holders.join(',') : false || '');
        }
        return text;
    }),

    useShortenedDescription: Ember.computed('node.description', function() {
        return this.get('node.description') ? this.get('node.description').length > 350 : false;
    }),

    description: Ember.computed('node.description', 'expandedAbstract', function() {
        // Get a shortened version of the abstract, but doesnt cut in the middle of word by going
        // to the last space.
        if (this.get('expandedAbstract')) {
            return this.get('node.description');
        }
        let text = this.get('node.description').slice(0, 350).split(' ');
        text.pop();
        return text.join(' ') + ' ...';
    }),

    actions: {
        toggleLicenseText() {
            const licenseState = this.toggleProperty('showLicenseText') ? 'Expand' : 'Contract';
            Ember.get(this, 'metrics')
                .trackEvent({
                    category: 'button',
                    action: 'click',
                    label: `Preprints - Content - License ${licenseState}`
                });
        },
        expandMFR() {
            // State of fullScreenMFR before the transition (what the user perceives as the action)
            const beforeState = this.toggleProperty('fullScreenMFR') ? 'Expand' : 'Contract';

            Ember.get(this, 'metrics')
                .trackEvent({
                    category: 'button',
                    action: 'click',
                    label: `Preprints - Content - MFR ${beforeState}`
                });
        },
        // Unused
        expandAuthors() {
            this.toggleProperty('expandedAuthors');
        },
        expandAbstract() {
            this.toggleProperty('expandedAbstract');
        },
        // Metrics are handled in the component
        chooseFile(fileItem) {
            this.set('activeFile', fileItem);
        },
        shareLink(href, network, action) {
            const metrics = Ember.get(this, 'metrics');

            if (network.includes('email')) {
                metrics.trackEvent({
                    category: 'link',
                    action,
                    label: `Preprints - Content - Email ${window.location.href}`
                });
            } else {
                window.open(href, '', 'menubar=no,toolbar=no,resizable=yes,scrollbars=yes,width=600,height=400');
                // TODO submit PR to ember-metrics for a trackSocial function for Google Analytics. For now, we'll use trackEvent.
                metrics.trackEvent({
                    category: network,
                    action,
                    label: `Preprints - Content - ${window.location.href}`
                });
            }

            return false;
        },
        // Sends Event to GA.  Only sends event to Keen if non-contributor.
        dualTrackNonContributors(category, label, url) {
            this.send('click', category, label, url); // Sends event to Google Analytics
            const authors = this.get('authors');
            let userIsContrib = false;

            const eventData = {
                download_info: {
                    preprint: {
                        type: 'preprint',
                        id: this.get('model.id')
                    },
                    file: {
                        id: this.get('activeFile.id'),
                        primaryFile: this.get('model.primaryFile.id') === this.get('activeFile.id')
                    }
                },
                interaction: {
                    category: category,
                    action: 'click',
                    label: `${label} as Non-Contributor`,
                    url: url
                }
            };

            this.get('currentUser').load()
                .then(user => {
                    if (user) {
                        const userId = user.id;
                        authors.forEach((author) => {
                            if (author.get('userId') === userId) {
                                userIsContrib = true;
                            }
                        });
                    }
                    if (!userIsContrib) {
                        this.keenTrackEvent('preprint_downloads', eventData, this.get('node'));  // Sends event to Keen if logged in user is not a preprint author
                    }
                })
                .catch(() => {
                    this.keenTrackEvent('preprint_downloads', eventData, this.get('node')); // Sends event to Keen for non-authenticated user
                });
        }
    },
});
