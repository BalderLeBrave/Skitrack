( function( $ ) {

	var LaeDispoAccueil = function ($scope) {
		var root = $scope.find('.moteur-resa-homepage').get(0);
		if (!root) {
			return;
		}

		var form = root.querySelector('.moteur--content');
		var arrivalInput = root.querySelector('.arrivalDateInput');
		var departureInput = root.querySelector('.departureDateInput');
		var pageInput = root.querySelector('.pageInput');
		var submitButton = root.querySelector('.btn-reserver');
		var message = root.querySelector('.dispo-message');

		if (!form || !arrivalInput || !departureInput || !pageInput || !submitButton || !message) {
			return;
		}

		var now = new Date();
		var today = now.toISOString().slice(0, 10);
		var loading = false;

		arrivalInput.setAttribute('min', today);
		departureInput.setAttribute('min', today);

		var setMessage = function(text) {
			message.textContent = text || '';
		};

		var normalizeDeparture = function() {
			if (!arrivalInput.value) {
				departureInput.min = today;
				return;
			}

			departureInput.min = arrivalInput.value;

			if (!departureInput.value || departureInput.value < arrivalInput.value) {
				departureInput.value = arrivalInput.value;
			}
		};

		arrivalInput.addEventListener('change', function() {
			normalizeDeparture();
			setMessage('');
		});

		departureInput.addEventListener('change', function() {
			if (departureInput.value && arrivalInput.value && departureInput.value < arrivalInput.value) {
				departureInput.value = arrivalInput.value;
			}
			setMessage('');
		});

		form.addEventListener('submit', function(event) {
			event.preventDefault();

			if (!arrivalInput.value) {
				setMessage("Merci de saisir une date d'arrivée avant de rechercher une disponibilité.");
				arrivalInput.focus();
				return;
			}

			if (loading) {
				return;
			}

			loading = true;
			submitButton.disabled = true;
			submitButton.setAttribute('aria-busy', 'true');
			setMessage('');

			normalizeDeparture();

			var dateParam = 'id1[d]=~' + arrivalInput.value;
			if (departureInput.value) {
				dateParam += '~' + departureInput.value;
			}

			var targetUrl = pageInput.value || root.getAttribute('data-default-page') || '';
			if (!targetUrl) {
				loading = false;
				submitButton.disabled = false;
				submitButton.removeAttribute('aria-busy');
				setMessage('Aucune URL de destination disponible.');
				return;
			}

			window.location.href = targetUrl.replace('?', '?' + dateParam + '&');
		});
	};

	/**
 	 * @param $scope The Widget wrapper element as a jQuery element
	 * @param $ The jQuery alias
	 */ 
	var LaeDispoAccueilHandler = function( $scope, $ ) {
		new LaeDispoAccueil($scope);
	};

	$(window).on( 'elementor/frontend/init', function() {
		elementorFrontend.hooks.addAction( 'frontend/element_ready/lae-dispo-accueil.default', LaeDispoAccueilHandler );
	});
	
} )( jQuery );
